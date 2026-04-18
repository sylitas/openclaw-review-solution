'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { requestJson } = require('../shared/http');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 960,
    minHeight: 720,
    title: 'OpenClaw Review Solution',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
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
    return getCurrentSessionRequest();
  });

  ipcMain.handle('review:get-health', async () => {
    return getHealth();
  });

  ipcMain.handle('review:submit-result', async (_event, payload) => {
    const currentRequest = await getCurrentSessionRequest();
    if (!currentRequest || !currentRequest.id) {
      throw new Error('No active session request found.');
    }

    const response = await requestJson(
      'POST',
      `/session/${encodeURIComponent(currentRequest.id)}/result`,
      payload || {}
    );

    const nextRequest = await getCurrentSessionRequest().catch(() => null);

    return {
      ...(response.data || { ok: true }),
      nextRequest,
    };
  });

  ipcMain.handle('review:close-window', async () => {
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
