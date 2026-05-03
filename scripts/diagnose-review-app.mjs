import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const appSupportDir = path.join(
  process.env.HOME || '',
  'Library',
  'Application Support',
  'openclaw-review-solution'
);
const stateFilePath = path.join(appSupportDir, 'state.json');

const REQUIRED_IDS = [
  'title',
  'prompt',
  'artifact-type',
  'status-info-toggle',
  'help-info-toggle',
  'artifact-host',
  'viewer',
  'viewer-stage',
  'annotation-layer',
  'message',
  'approve',
  'changes',
  'cancel',
  'undo-annotation',
  'duplicate-selected',
  'delete-or-clear',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'zoom-level',
  'zoom-state',
  'selection-state',
  'annotation-count',
  'active-tool',
  'artifact-box-state',
  'daemon-connection-state',
  'session-mode-state',
  'queue-state',
  'request-state',
  'daemon-message',
  'annotation-inspector',
  'inspector-empty',
  'inspector-content',
  'inspector-type',
  'inspector-label',
  'annotation-meta-input',
];

function run(command, args, { cwd = projectRoot, timeoutMs = 30000, stdio = 'pipe' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timeout after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function check(condition, label, detail, failures) {
  if (condition) {
    console.log(`✅ ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }

  console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
  failures.push({ label, detail });
}

function httpJson(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 43129,
        path: route,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': String(payload.length),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ statusCode: res.statusCode || 0, data: text ? JSON.parse(text) : {} });
          } catch (error) {
            reject(new Error(`Invalid JSON from ${route}: ${error.message}\n${text}`));
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureBuild() {
  const result = await run('node', ['./scripts/build-renderer.mjs'], {
    cwd: projectRoot,
    timeoutMs: 60000,
  });

  if (result.code !== 0) {
    throw new Error(`build:renderer failed\n${result.stdout}\n${result.stderr}`);
  }

  return result;
}

function extractIdsFromShell() {
  const shellPath = path.join(projectRoot, 'src', 'renderer', 'ui', 'AppShell.jsx');
  const shell = fs.readFileSync(shellPath, 'utf8');
  const ids = [...shell.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  return new Set(ids);
}

function extractAppReferences() {
  const appPath = path.join(projectRoot, 'src', 'renderer', 'app.js');
  const app = fs.readFileSync(appPath, 'utf8');
  return [...app.matchAll(/document\.getElementById\('([^']+)'\)/g)].map((match) => match[1]);
}

async function startDaemonForProbe() {
  const child = spawn('node', ['src/daemon/reviewd.js'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const start = Date.now();
  while (Date.now() - start < 5000) {
    try {
      const health = await httpJson('GET', '/health');
      if (health.statusCode === 200 && health.data.ok) {
        return { child, stdout, stderr, reusedExisting: true };
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const listenStart = Date.now();
  while (Date.now() - listenStart < 5000) {
    try {
      const health = await httpJson('GET', '/health');
      if (health.statusCode === 200 && health.data.ok) {
        return { child, stdout, stderr, reusedExisting: false };
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  child.kill('SIGKILL');
  throw new Error(`Daemon did not become healthy.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetSessionQueue() {
  for (let i = 0; i < 12; i += 1) {
    const currentResp = await httpJson('GET', '/session/current');
    const currentRequest = currentResp?.data?.request;
    if (!currentRequest || !currentRequest.id) {
      return;
    }

    await httpJson('POST', `/session/${currentRequest.id}/result`, {
      status: 'cancelled',
      message: 'Diagnostic queue reset.',
      annotations: [],
      coordinateSpace: {
        kind: 'normalized-artifact-box',
        stageWidth: null,
        stageHeight: null,
        artifactBox: null,
        exportWidth: null,
        exportHeight: null,
      },
      exportPayload: null,
    }).catch(() => null);

    await wait(200);
  }
}

async function main() {
  const failures = [];

  console.log('=== Review app diagnostic ===');

  await ensureBuild();
  check(true, 'Renderer build', 'build:renderer passed', failures);

  const distHtmlPath = path.join(projectRoot, 'dist', 'renderer', 'index.html');
  const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
  check(distHtml.includes('src="./assets/'), 'Relative JS asset path', './assets/... present in built html', failures);
  check(distHtml.includes('href="./assets/'), 'Relative CSS asset path', './assets/... present in built html', failures);
  check(fs.existsSync(path.join(projectRoot, 'dist', 'renderer', 'assets')), 'Bundled renderer assets emitted', 'dist/renderer/assets exists', failures);

  const shellIds = extractIdsFromShell();
  for (const id of REQUIRED_IDS) {
    check(shellIds.has(id), `Shell renders #${id}`, '', failures);
  }

  const appRefs = extractAppReferences();
  const missingContractIds = appRefs.filter((id) => !shellIds.has(id));
  check(missingContractIds.length === 0, 'React shell / legacy app DOM contract', missingContractIds.length ? `Missing ids: ${missingContractIds.join(', ')}` : 'all getElementById references present', failures);

  check(distHtml.includes('id="react-root"'), 'Built html contains React root', 'react-root present', failures);
  check(!distHtml.includes('<script src="./app.js"></script>'), 'Built html removes legacy classic bridge', 'app.js is imported through react-main module', failures);

  const daemon = await startDaemonForProbe();
  await resetSessionQueue();
  const health = await httpJson('GET', '/health');
  check(health.statusCode === 200 && health.data.ok, 'Daemon health endpoint', JSON.stringify(health.data), failures);

  const requestId = `diag_${Date.now()}`;
  const requestPayload = {
    id: requestId,
    artifactType: 'mermaid',
    title: 'diagnostic-request',
    prompt: 'diagnostic flow',
    inlineContent: 'flowchart TD\nA[Test] --> B[Render]',
    createdAt: new Date().toISOString(),
  };

  const createResp = await httpJson('POST', '/requests', requestPayload);
  check(createResp.statusCode === 202, 'Create request via daemon API', `status=${createResp.statusCode}`, failures);

  let currentResp = await httpJson('GET', '/session/current');
  for (let i = 0; i < 10 && (!currentResp.data.request || currentResp.data.request.id !== requestId); i += 1) {
    await wait(200);
    currentResp = await httpJson('GET', '/session/current');
  }
  check(currentResp.statusCode === 200 && currentResp.data.request && currentResp.data.request.id === requestId, 'Session current exposes active request', currentResp.data.request ? currentResp.data.request.id : 'none', failures);

  const resultPayload = {
    status: 'approved',
    message: 'diagnostic complete',
    annotations: [],
    coordinateSpace: {
      kind: 'normalized-artifact-box',
      stageWidth: 1200,
      stageHeight: 800,
      artifactBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      exportWidth: 1200,
      exportHeight: 800,
    },
  };

  const submitResp = await httpJson('POST', `/session/${requestId}/result`, resultPayload);
  check(submitResp.statusCode === 200 && submitResp.data.ok, 'Submit result via daemon API', `status=${submitResp.statusCode}`, failures);

  const requestResp = await httpJson('GET', `/requests/${requestId}`);
  check(requestResp.statusCode === 200 && requestResp.data.request && requestResp.data.request.status === 'approved', 'Stored request reaches terminal state', requestResp.data.request ? requestResp.data.request.status : 'none', failures);
  check(Boolean(requestResp?.data?.request?.result), 'Daemon-visible terminal result available', requestResp?.data?.request?.result ? 'result present on request record' : 'missing result', failures);

  const manifestPath = path.join(projectRoot, 'tmp', 'manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : null;
  const manifestArtifact = manifest && Array.isArray(manifest.artifacts)
    ? manifest.artifacts.find((artifact) => artifact && artifact.requestId === requestId)
    : null;

  check(Boolean(manifest && manifest.schemaVersion === '2.0'), 'Artifact manifest upgraded to v2', manifest ? `schema=${manifest.schemaVersion}` : 'missing manifest', failures);
  check(Boolean(manifest && Array.isArray(manifest.artifacts) && !Object.prototype.hasOwnProperty.call(manifest, 'requests')), 'Artifact manifest uses flat schema', manifest ? Object.keys(manifest).join(', ') : 'missing manifest', failures);
  check(Boolean(manifestArtifact), 'Manifest contains mermaid artifact row', manifestArtifact ? manifestArtifact.path : 'missing artifact row', failures);
  check(Boolean(manifestArtifact && typeof manifestArtifact.path === 'string' && manifestArtifact.path.includes(`${path.sep}tmp${path.sep}.artifact${path.sep}`)), 'Artifact stored under tmp/.artifact', manifestArtifact ? manifestArtifact.path : 'missing artifact path', failures);
  check(Boolean(manifestArtifact && fs.existsSync(manifestArtifact.path)), 'Artifact file written', manifestArtifact ? manifestArtifact.path : 'missing artifact path', failures);

  const appSupportResultPath = path.join(appSupportDir, 'results', `${requestId}.json`);
  check(!fs.existsSync(appSupportResultPath), 'App-support result file not persisted', appSupportResultPath, failures);
  check(fs.existsSync(stateFilePath), 'State file written', stateFilePath, failures);

  daemon.child.kill('SIGTERM');

  console.log('---');
  if (failures.length > 0) {
    console.log(`Diagnostic failed: ${failures.length} issue(s)`);
    process.exitCode = 1;
    return;
  }

  console.log('Diagnostic passed');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
