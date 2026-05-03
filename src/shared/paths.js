'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { APP_NAME } = require('./constants');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getProjectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getTmpDir() {
  return ensureDir(path.join(getProjectRoot(), 'tmp'));
}

function getGeneratedArtifactsDir() {
  return ensureDir(path.join(getTmpDir(), '.artifact'));
}

function getArtifactManifestPath() {
  return path.join(getTmpDir(), 'manifest.json');
}

function getBaseDir() {
  return ensureDir(
    path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
  );
}

function getExportsDir() {
  return ensureDir(path.join(getBaseDir(), 'exports'));
}

function getStateFilePath() {
  return path.join(getBaseDir(), 'state.json');
}

function getExportRoot(requestId) {
  return ensureDir(path.join(getExportsDir(), requestId));
}

module.exports = {
  ensureDir,
  getProjectRoot,
  getTmpDir,
  getGeneratedArtifactsDir,
  getArtifactManifestPath,
  getBaseDir,
  getExportsDir,
  getStateFilePath,
  getExportRoot,
};
