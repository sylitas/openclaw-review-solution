'use strict';

const path = require('path');
const http = require('http');
const { DAEMON_HOST, DAEMON_PORT } = require('../shared/constants');
const { saveResult } = require('../shared/result');
const { createFailureResult, toPublicRecord } = require('./record-utils');
const { createStateStore } = require('./state-store');
const { createUiLauncher } = require('./ui-launcher');
const { createQueueManager } = require('./queue-manager');

const projectRoot = path.resolve(__dirname, '..', '..');
const stateStore = createStateStore();

let queue = null;

const uiLauncher = createUiLauncher({
  projectRoot,
  onLaunchError(error) {
    console.error(`[reviewd] Failed to launch UI: ${error.message}`);
    queue.failActiveRequest(`Failed to launch UI: ${error.message}`);
  },
  onWindowClosed() {
    const activeRequest = queue.getActiveRequest();
    if (activeRequest && activeRequest.status === 'active') {
      queue.failActiveRequest(
        'Review window was closed before completing the request.'
      );
    }
  },
});

queue = createQueueManager({
  saveResult,
  createFailureResult,
  stateStore,
  onActiveRequest() {
    uiLauncher.ensureWindow();
  },
});

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function collectJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

async function handleHealth(_req, res) {
  sendJson(res, 200, {
    ok: true,
    activeRequestId: queue.getActiveRequest() ? queue.getActiveRequest().id : null,
    queuedCount: queue.getQueuedCount(),
    uiRunning: uiLauncher.isRunning(),
  });
}

async function handleCreateRequest(req, res) {
  try {
    const body = await collectJson(req);
    if (!body || !body.artifactType) {
      sendJson(res, 400, { error: 'artifactType is required.' });
      return;
    }

    const record = queue.enqueue(body);
    sendJson(res, 202, { request: toPublicRecord(record) });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleGetRequest(_req, res, requestId) {
  const record = queue.getRequest(requestId);
  if (!record) {
    sendJson(res, 404, { error: 'Request not found.' });
    return;
  }

  sendJson(res, 200, { request: toPublicRecord(record) });
}

async function handleCurrentSession(_req, res) {
  const activeRequest = queue.getActiveRequest();
  sendJson(res, 200, { request: activeRequest ? activeRequest.request : null });
}

async function handleSessionResult(req, res, requestId) {
  const activeRequest = queue.getActiveRequest();
  if (!activeRequest || activeRequest.id !== requestId) {
    sendJson(res, 409, { error: 'Active session mismatch.' });
    return;
  }

  try {
    const payload = await collectJson(req);
    const result = queue.completeActiveWithPayload(payload);
    sendJson(res, 200, { ok: true, result });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${DAEMON_HOST}:${DAEMON_PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    await handleHealth(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/requests') {
    await handleCreateRequest(req, res);
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/requests/')) {
    const requestId = decodeURIComponent(url.pathname.split('/')[2] || '');
    await handleGetRequest(req, res, requestId);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/session/current') {
    await handleCurrentSession(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/session/')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const requestId = parts[1] || '';
    const action = parts[2] || '';

    if (action !== 'result') {
      sendJson(res, 404, { error: 'Unknown session action.' });
      return;
    }

    await handleSessionResult(req, res, requestId);
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
}

queue.initialize();

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(`[reviewd] Unhandled request error: ${error.message}`);
    sendJson(res, 500, { error: 'Internal server error.' });
  });
});

server.listen(DAEMON_PORT, DAEMON_HOST, () => {
  console.log(`[reviewd] listening on http://${DAEMON_HOST}:${DAEMON_PORT}`);
});
