'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { APP_NAME } = require('./constants');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getBaseDir() {
  return ensureDir(
    path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
  );
}

function getResultsDir() {
  return ensureDir(path.join(getBaseDir(), 'results'));
}

function getExportsDir() {
  return ensureDir(path.join(getBaseDir(), 'exports'));
}

function getStateFilePath() {
  return path.join(getBaseDir(), 'state.json');
}

function getResultFilePath(requestId) {
  return path.join(getResultsDir(), `${requestId}.json`);
}

function getExportRoot(requestId) {
  return ensureDir(path.join(getExportsDir(), requestId));
}

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getTmpDir() {
  return ensureDir(path.join(getProjectRoot(), 'tmp'));
}

function getGeneratedFilesManifestPath() {
  return path.join(getTmpDir(), 'manifest.json');
}

function getRequestTmpDir(requestId) {
  return ensureDir(path.join(getTmpDir(), 'requests', requestId));
}

module.exports = {
  ensureDir,
  getBaseDir,
  getResultsDir,
  getExportsDir,
  getStateFilePath,
  getResultFilePath,
  getExportRoot,
  getProjectRoot,
  getTmpDir,
  getGeneratedFilesManifestPath,
  getRequestTmpDir,
};
