'use strict';

const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('error', (event) => {
  try {
    console.error('[renderer-error]', event.message);
  } catch {}
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    console.error('[renderer-unhandledrejection]', event.reason);
  } catch {}
});

contextBridge.exposeInMainWorld('reviewApp', {
  getInitialRequest() {
    return ipcRenderer.invoke('review:get-initial-request');
  },
  getHealth() {
    return ipcRenderer.invoke('review:get-health');
  },
  heartbeat(payload) {
    return ipcRenderer.invoke('review:heartbeat', payload);
  },
  submitResult(payload) {
    return ipcRenderer.invoke('review:submit-result', payload);
  },
  closeWindow() {
    return ipcRenderer.invoke('review:close-window');
  },
  onResultSubmitted(handler) {
    if (typeof handler !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('review:result-submitted', listener);
    return () => {
      ipcRenderer.removeListener('review:result-submitted', listener);
    };
  }
});
