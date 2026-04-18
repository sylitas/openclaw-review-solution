'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reviewApp', {
  getInitialRequest() {
    return ipcRenderer.invoke('review:get-initial-request');
  },
  getHealth() {
    return ipcRenderer.invoke('review:get-health');
  },
  submitResult(payload) {
    return ipcRenderer.invoke('review:submit-result', payload);
  },
  closeWindow() {
    return ipcRenderer.invoke('review:close-window');
  }
});
