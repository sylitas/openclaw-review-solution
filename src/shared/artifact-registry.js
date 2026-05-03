'use strict';

const fs = require('fs');
const path = require('path');
const {
  ensureDir,
  getArtifactManifestPath,
  getGeneratedArtifactsDir,
} = require('./paths');

const MANIFEST_SCHEMA_VERSION = '2.0';

function readManifest() {
  const manifestPath = getArtifactManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      artifacts: [],
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return normalizeManifest(raw);
  } catch {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      artifacts: [],
    };
  }
}

function normalizeManifest(raw) {
  if (
    raw &&
    raw.schemaVersion === MANIFEST_SCHEMA_VERSION &&
    Array.isArray(raw.artifacts)
  ) {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      artifacts: raw.artifacts
        .map(normalizeArtifactRow)
        .filter(Boolean),
    };
  }

  if (raw && raw.schemaVersion === '1.0' && Array.isArray(raw.requests)) {
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      artifacts: raw.requests
        .flatMap((request) => normalizeV1Request(request))
        .filter(Boolean),
    };
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    artifacts: [],
  };
}

function normalizeV1Request(request) {
  if (!request || !Array.isArray(request.files)) {
    return [];
  }

  return request.files
    .filter((file) => {
      if (!file || typeof file.path !== 'string') {
        return false;
      }

      if (request.artifactType && request.artifactType !== 'mermaid') {
        return false;
      }

      return file.kind === 'artifact' && path.extname(file.path).toLowerCase() === '.mmd';
    })
    .map((file) =>
      normalizeArtifactRow({
        requestId: request.requestId || null,
        title: request.title || null,
        artifactType: 'mermaid',
        path: path.resolve(file.path),
        createdAt: file.createdAt || request.createdAt || new Date().toISOString(),
      })
    )
    .filter(Boolean);
}

function normalizeArtifactRow(row) {
  if (!row || typeof row.path !== 'string') {
    return null;
  }

  return {
    requestId: row.requestId || null,
    title: row.title || null,
    artifactType: row.artifactType || 'mermaid',
    path: path.resolve(row.path),
    createdAt: row.createdAt || new Date().toISOString(),
  };
}

function writeManifest(manifest) {
  const normalized = normalizeManifest(manifest);
  const manifestPath = getArtifactManifestPath();
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(normalized, null, 2), 'utf8');
  return manifestPath;
}

function createUniqueArtifactPath(createdAt) {
  const dir = getGeneratedArtifactsDir();
  const timestampMs = Number.isFinite(Date.parse(createdAt || ''))
    ? Date.parse(createdAt)
    : Date.now();
  const baseName = String(timestampMs);
  let candidate = path.join(dir, `${baseName}.mmd`);
  let suffix = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName}-${suffix}.mmd`);
    suffix += 1;
  }

  return candidate;
}

function registerGeneratedMermaidArtifact({ requestId, title, content, createdAt }) {
  if (typeof content !== 'string') {
    throw new Error('Mermaid content is required.');
  }

  const artifactPath = createUniqueArtifactPath(createdAt);
  fs.writeFileSync(artifactPath, content, 'utf8');

  const manifest = readManifest();
  const artifact = normalizeArtifactRow({
    requestId: requestId || null,
    title: title || null,
    artifactType: 'mermaid',
    path: artifactPath,
    createdAt: createdAt || new Date().toISOString(),
  });

  manifest.artifacts.push(artifact);
  writeManifest(manifest);

  return artifact;
}

function listGeneratedArtifacts() {
  return readManifest().artifacts;
}

function listGeneratedRequests() {
  return listGeneratedArtifacts().map((artifact) => ({
    requestId: artifact.requestId,
    title: artifact.title,
    artifactType: artifact.artifactType || 'mermaid',
    createdAt: artifact.createdAt,
    completedAt: artifact.createdAt,
    files: [
      {
        name: path.basename(artifact.path),
        kind: 'artifact',
        path: artifact.path,
        createdAt: artifact.createdAt,
      },
    ],
  }));
}

module.exports = {
  MANIFEST_SCHEMA_VERSION,
  listGeneratedArtifacts,
  listGeneratedRequests,
  readManifest,
  registerGeneratedMermaidArtifact,
  writeManifest,
};
