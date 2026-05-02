'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { requestJson } = require('../shared/http');
const { debugLog } = require('../shared/debug-log');

let mainWindow = null;

function resolveRendererEntry() {
  const builtRendererPath = path.join(
    app.getAppPath(),
    'dist',
    'renderer',
    'index.html'
  );

  return builtRendererPath;
}

function createWindow() {
  debugLog('main', 'createWindow:start');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: 'OpenClaw Review Solution',
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const rendererEntry = resolveRendererEntry();
  debugLog('main', 'createWindow:loadFile', { rendererEntry });
  mainWindow.loadFile(rendererEntry);

  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('main', 'webContents:did-finish-load');
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    debugLog('renderer-console', 'console-message', {
      level,
      message,
      line,
      sourceId,
    });
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    debugLog('main', 'webContents:did-fail-load', {
      code,
      description,
      validatedURL,
    });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    debugLog('main', 'webContents:render-process-gone', details || null);
  });

  mainWindow.on('closed', () => {
    debugLog('main', 'window:closed');
    mainWindow = null;
  });
}

async function getCurrentSessionRequest() {
  const response = await requestJson('GET', '/session/current');
  const request = response.data ? response.data.request : null;

  if (request && request.artifactType === 'mermaid') {
    request.mermaidScriptUrl = `file://${path.join(
      app.getAppPath(),
      'node_modules',
      'mermaid',
      'dist',
      'mermaid.min.js'
    )}`;
  }

  return request;
}

async function getHealth() {
  const response = await requestJson('GET', '/health');
  return response.data || {
    ok: false,
    activeRequestId: null,
    queuedCount: 0,
    uiRunning: false,
  };
}

async function sendHeartbeat(payload) {
  const response = await requestJson('POST', '/session/heartbeat', payload || {});
  return response.data || { ok: true, uiRunning: true };
}

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  ipcMain.handle('review:get-initial-request', async () => {
    debugLog('ipc', 'review:get-initial-request');
    const request = await getCurrentSessionRequest();
    debugLog('ipc', 'review:get-initial-request:result', {
      requestId: request ? request.id || null : null,
      artifactType: request ? request.artifactType || null : null,
    });
    return request;
  });

  ipcMain.handle('review:get-health', async () => {
    debugLog('ipc', 'review:get-health');
    const health = await getHealth();
    debugLog('ipc', 'review:get-health:result', health || null);
    return health;
  });

  ipcMain.handle('review:heartbeat', async (_event, payload) => {
    debugLog('ipc', 'review:heartbeat', payload || null);
    return sendHeartbeat(payload);
  });

  ipcMain.handle('review:submit-result', async (_event, payload) => {
    debugLog('ipc', 'review:submit-result', {
      status: payload ? payload.status : null,
      annotationCount: payload && Array.isArray(payload.annotations) ? payload.annotations.length : 0,
    });

    const currentRequest = await getCurrentSessionRequest();
    debugLog('ipc', 'review:submit-result:active-request', {
      requestId: currentRequest ? currentRequest.id || null : null,
    });
    if (!currentRequest || !currentRequest.id) {
      throw new Error('No active session request found.');
    }

    const response = await requestJson(
      'POST',
      `/session/${encodeURIComponent(currentRequest.id)}/result`,
      payload || {}
    );

    const nextRequest = await getCurrentSessionRequest().catch(() => null);

    const resultPayload = {
      ...(response.data || { ok: true }),
      nextRequest,
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('review:result-submitted', {
        requestId: currentRequest.id,
        status: payload ? payload.status || null : null,
        nextRequestId: nextRequest ? nextRequest.id || null : null,
      });
    }

    return resultPayload;
  });

  ipcMain.handle('review:close-window', async () => {
    debugLog('ipc', 'review:close-window');
    app.quit();
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
      return;
    }

    app.quit();
  });
}
