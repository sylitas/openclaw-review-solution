'use strict';

const fs = require('fs');
const path = require('path');
const {
  ensureDir,
  getRequestTmpDir,
  getTmpDir,
  getGeneratedFilesManifestPath,
} = require('./paths');

function readManifest() {
  const manifestPath = getGeneratedFilesManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return { schemaVersion: '1.0', requests: [] };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
      schemaVersion: raw && raw.schemaVersion ? raw.schemaVersion : '1.0',
      requests: Array.isArray(raw && raw.requests) ? raw.requests : [],
    };
  } catch {
    return { schemaVersion: '1.0', requests: [] };
  }
}

function writeManifest(manifest) {
  ensureDir(getTmpDir());
  fs.writeFileSync(getGeneratedFilesManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
}

function detectArtifactFileName(request) {
  if (!request) {
    return 'artifact.txt';
  }

  if (request.artifactType === 'mermaid') {
    return 'artifact.mmd';
  }

  if (request.artifactType === 'html') {
    return 'artifact.html';
  }

  if (request.sourcePath) {
    return path.basename(request.sourcePath);
  }

  return 'artifact.bin';
}

function ensureArtifactStored(request) {
  if (!request || !request.id) {
    return null;
  }

  const requestDir = getRequestTmpDir(request.id);
  const fileName = detectArtifactFileName(request);
  const artifactPath = path.join(requestDir, fileName);

  if (request.inlineContent != null) {
    fs.writeFileSync(artifactPath, String(request.inlineContent), 'utf8');
  } else if (request.sourcePath && fs.existsSync(request.sourcePath)) {
    fs.copyFileSync(request.sourcePath, artifactPath);
  } else {
    return null;
  }

  return artifactPath;
}

function upsertManifestRequest(request, patch = {}) {
  if (!request || !request.id) {
    return null;
  }

  const manifest = readManifest();
  const existing = manifest.requests.find((item) => item.requestId === request.id) || null;
  const requestDir = getRequestTmpDir(request.id);
  const base = existing || {
    requestId: request.id,
    title: request.title || null,
    artifactType: request.artifactType || null,
    createdAt: request.createdAt || new Date().toISOString(),
    completedAt: null,
    requestDir,
    files: [],
  };

  const next = {
    ...base,
    ...patch,
    requestId: request.id,
    title: request.title || base.title || null,
    artifactType: request.artifactType || base.artifactType || null,
    createdAt: request.createdAt || base.createdAt || new Date().toISOString(),
    requestDir,
    files: Array.isArray(patch.files) ? patch.files : base.files,
  };

  const nextRequests = manifest.requests.filter((item) => item.requestId !== request.id);
  nextRequests.push(next);
  nextRequests.sort(
    (a, b) =>
      Date.parse(b.completedAt || b.createdAt || 0) -
      Date.parse(a.completedAt || a.createdAt || 0)
  );

  writeManifest({ schemaVersion: '1.0', requests: nextRequests });
  return next;
}

function registerArtifactRequest(request) {
  if (!request || !request.id) {
    return null;
  }

  const artifactPath = ensureArtifactStored(request);
  const files = artifactPath
    ? [
        {
          name: path.basename(artifactPath),
          kind: 'artifact',
          path: artifactPath,
          relativePath: path.relative(getTmpDir(), artifactPath),
          createdAt: request.createdAt || new Date().toISOString(),
        },
      ]
    : [];

  return upsertManifestRequest(request, {
    files,
  });
}

function registerRequestOutputs(request, result, outputFiles = []) {
  if (!request || !request.id) {
    return null;
  }

  const manifest = readManifest();
  const existing = manifest.requests.find((item) => item.requestId === request.id) || null;
  const existingFiles = Array.isArray(existing && existing.files) ? existing.files : [];
  const mergedFiles = [...existingFiles];

  (Array.isArray(outputFiles) ? outputFiles : []).forEach((file) => {
    if (!file || !file.path) {
      return;
    }

    const normalized = {
      name: file.name || path.basename(file.path),
      kind: file.kind || 'file',
      path: file.path,
      relativePath: path.relative(getTmpDir(), file.path),
      createdAt: file.createdAt || (result && result.reviewedAt) || new Date().toISOString(),
    };

    const index = mergedFiles.findIndex((item) => item.path === normalized.path);
    if (index >= 0) {
      mergedFiles[index] = normalized;
    } else {
      mergedFiles.push(normalized);
    }
  });

  mergedFiles.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

  return upsertManifestRequest(request, {
    completedAt: result && result.reviewedAt ? result.reviewedAt : null,
    files: mergedFiles,
  });
}

function listGeneratedRequests() {
  const manifest = readManifest();
  return manifest.requests
    .slice()
    .sort(
      (a, b) =>
        Date.parse(b.completedAt || b.createdAt || 0) -
        Date.parse(a.completedAt || a.createdAt || 0)
    );
}

module.exports = {
  readManifest,
  writeManifest,
  registerArtifactRequest,
  registerRequestOutputs,
  listGeneratedRequests,
};
