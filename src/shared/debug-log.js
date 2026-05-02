'use strict';

const fs = require('fs');
const path = require('path');
const { getBaseDir, ensureDir } = require('./paths');

const logDir = ensureDir(path.join(getBaseDir(), 'logs'));
const logPath = path.join(logDir, 'runtime.log');

function debugLog(scope, message, meta) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    scope,
    message,
    meta: meta || null,
  });

  try {
    fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  } catch {}
}

module.exports = {
  debugLog,
  logPath,
};
