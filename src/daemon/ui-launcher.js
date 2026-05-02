'use strict';

const path = require('path');
const { spawn } = require('child_process');

function createUiLauncher({ projectRoot, onLaunchError, onWindowClosed, onWindowHeartbeat }) {
  const electronCli = path.join(projectRoot, 'node_modules', 'electron', 'cli.js');
  let uiProcess = null;
  let launchInFlight = false;
  let lastHeartbeatAt = 0;

  function markHeartbeat() {
    lastHeartbeatAt = Date.now();
    if (typeof onWindowHeartbeat === 'function') {
      onWindowHeartbeat(lastHeartbeatAt);
    }
  }

  function ensureWindow() {
    if (uiProcess && !uiProcess.killed) {
      return;
    }

    if (launchInFlight) {
      return;
    }

    launchInFlight = true;

    uiProcess = spawn(process.execPath, [electronCli, '.'], {
      cwd: projectRoot,
      stdio: 'ignore',
      detached: true,
    });

    uiProcess.unref();
    markHeartbeat();

    uiProcess.on('error', (error) => {
      launchInFlight = false;
      uiProcess = null;
      onLaunchError(error);
    });

    uiProcess.on('spawn', () => {
      markHeartbeat();
      setTimeout(() => {
        launchInFlight = false;
      }, 1500);
    });

    uiProcess.on('exit', () => {
      const exitedDuringLaunch = launchInFlight;
      launchInFlight = false;
      uiProcess = null;

      if (exitedDuringLaunch) {
        markHeartbeat();
        return;
      }

      onWindowClosed({ lastHeartbeatAt });
    });
  }

  function isRunning() {
    return Boolean(uiProcess && !uiProcess.killed) || launchInFlight;
  }

  function getLastHeartbeatAt() {
    return lastHeartbeatAt;
  }

  return {
    ensureWindow,
    isRunning,
    markHeartbeat,
    getLastHeartbeatAt,
  };
}

module.exports = {
  createUiLauncher,
};
