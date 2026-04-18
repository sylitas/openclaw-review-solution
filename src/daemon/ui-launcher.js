'use strict';

const path = require('path');
const { spawn } = require('child_process');

function createUiLauncher({ projectRoot, onLaunchError, onWindowClosed }) {
  const electronBin = path.join(projectRoot, 'node_modules', '.bin', 'electron');
  let uiProcess = null;

  function ensureWindow() {
    if (uiProcess && !uiProcess.killed) {
      return;
    }

    uiProcess = spawn(electronBin, ['.'], {
      cwd: projectRoot,
      stdio: 'ignore',
    });

    uiProcess.on('error', (error) => {
      uiProcess = null;
      onLaunchError(error);
    });

    uiProcess.on('exit', () => {
      uiProcess = null;
      onWindowClosed();
    });
  }

  function isRunning() {
    return Boolean(uiProcess && !uiProcess.killed);
  }

  return {
    ensureWindow,
    isRunning,
  };
}

module.exports = {
  createUiLauncher,
};
