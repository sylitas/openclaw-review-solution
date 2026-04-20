'use strict';

const path = require('path');
const { spawn } = require('child_process');

function createUiLauncher({ projectRoot, onLaunchError, onWindowClosed }) {
  const electronCli = path.join(projectRoot, 'node_modules', 'electron', 'cli.js');
  let uiProcess = null;

  function ensureWindow() {
    if (uiProcess && !uiProcess.killed) {
      return;
    }

    uiProcess = spawn(process.execPath, [electronCli, '.'], {
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
