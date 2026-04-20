#!/usr/bin/env node
'use strict';

const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { requestJson } = require('../shared/http');
const { REQUEST_POLL_INTERVAL_MS } = require('../shared/constants');

const projectRoot = path.resolve(__dirname, '..', '..');
const pm2Cli = path.join(projectRoot, 'node_modules', 'pm2', 'bin', 'pm2');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === 'open') {
    await handleOpen(args.slice(1));
    return;
  }

  if (command === 'render') {
    await handleRender(args.slice(1));
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

function printHelp() {
  console.log(`review - local review loop CLI

Commands:
  review open <path> [--title "..."] [--prompt "..."]
  review render --format mermaid|html [--title "..."] [--prompt "..."] < input
`);
}

async function handleOpen(args) {
  const sourcePath = args[0];

  if (!sourcePath) {
    console.error('Missing file path.');
    process.exit(2);
  }

  const flags = parseFlags(args.slice(1));
  const resolved = path.resolve(process.cwd(), sourcePath);
  const ext = path.extname(resolved).toLowerCase();

  const artifactType = detectArtifactType(ext);

  if (artifactType === 'mermaid' || artifactType === 'html') {
    const inlineContent = require('fs').readFileSync(resolved, 'utf8');
    const request = {
      id: createRequestId(),
      artifactType,
      title: flags.title || path.basename(sourcePath),
      prompt: flags.prompt || `Review this ${artifactType} artifact.`,
      inlineContent,
      createdAt: new Date().toISOString(),
    };

    await submitAndAwait(request);
    return;
  }

  const request = {
    id: createRequestId(),
    artifactType: 'image',
    title: flags.title || path.basename(sourcePath),
    prompt: flags.prompt || 'Review this image.',
    sourcePath: resolved,
    createdAt: new Date().toISOString(),
  };

  await submitAndAwait(request);
}

function detectArtifactType(ext) {
  if (ext === '.mmd' || ext === '.mermaid') {
    return 'mermaid';
  }

  if (ext === '.html' || ext === '.htm') {
    return 'html';
  }

  return 'image';
}

async function handleRender(args) {
  const flags = parseFlags(args);

  if (!flags.format || !['html', 'mermaid'].includes(flags.format)) {
    console.error('Missing or invalid --format. Use mermaid or html.');
    process.exit(2);
  }

  const inlineContent = await readStdin();

  const request = {
    id: createRequestId(),
    artifactType: flags.format,
    title: flags.title || `${flags.format} review`,
    prompt: flags.prompt || `Review this ${flags.format} artifact.`,
    inlineContent,
    createdAt: new Date().toISOString(),
  };

  await submitAndAwait(request);
}

async function submitAndAwait(request) {
  try {
    await ensureDaemonAvailable();
    const createResponse = await requestJson('POST', '/requests', request);
    const requestId = createResponse.data.request.id;
    const result = await waitForCompletion(requestId);
    console.log(JSON.stringify(result, null, 2));

    if (result.status === 'cancelled') {
      process.exit(3);
      return;
    }

    if (result.status === 'failed') {
      process.exit(1);
      return;
    }

    process.exit(0);
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}

async function ensureDaemonAvailable() {
  try {
    await requestJson('GET', '/health');
    return;
  } catch (error) {
    if (!shouldAttemptDaemonStart(error)) {
      throw error;
    }
  }

  await startDaemonViaPm2();
  await waitForDaemonHealth();
}

function shouldAttemptDaemonStart(error) {
  if (!error) {
    return false;
  }

  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'ECONNABORTED',
    'ENOTFOUND',
  ].includes(error.code);
}

function startDaemonViaPm2() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pm2Cli, 'start', 'ecosystem.config.cjs', '--only', 'openclaw-reviewd'], {
      cwd: projectRoot,
      stdio: 'ignore',
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start daemon via PM2: ${error.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error('Failed to start daemon via PM2.'));
    });
  });
}

async function waitForDaemonHealth() {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    try {
      await requestJson('GET', '/health');
      return;
    } catch {
      await sleep(500);
    }
  }

  throw new Error('Daemon did not become healthy in time.');
}

async function waitForCompletion(requestId) {
  for (;;) {
    const response = await requestJson('GET', `/requests/${encodeURIComponent(requestId)}`);
    const record = response.data.request;
    if (record && isTerminalStatus(record.status) && record.result) {
      return record.result;
    }
    await sleep(REQUEST_POLL_INTERVAL_MS);
  }
}

function isTerminalStatus(status) {
  return ['approved', 'changes_requested', 'cancelled', 'failed'].includes(status);
}

function parseFlags(args) {
  const flags = {};

  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];

    if (key === '--title' && value) {
      flags.title = value;
      i += 1;
      continue;
    }

    if (key === '--prompt' && value) {
      flags.prompt = value;
      i += 1;
      continue;
    }

    if (key === '--format' && value) {
      flags.format = value;
      i += 1;
    }
  }

  return flags;
}

function createRequestId() {
  return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let resolved = false;

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    process.stdin.on('error', (error) => {
      if (resolved) {
        return;
      }

      resolved = true;
      reject(error);
    });

    if (process.stdin.isTTY) {
      resolved = true;
      resolve('');
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
