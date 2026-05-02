'use strict';

const fs = require('fs');
const path = require('path');
const {
  getExportRoot,
  getResultFilePath,
  getRequestTmpDir,
} = require('./paths');

function buildResult(request, payload, exportsInfo) {
  const annotations = Array.isArray(payload.annotations) ? payload.annotations : [];
  const coordinateSpace = payload.coordinateSpace || {
    kind: 'normalized-artifact-box',
    stageWidth: null,
    stageHeight: null,
    artifactBox: null,
    exportWidth: null,
    exportHeight: null,
  };

  return {
    schemaVersion: '1.1',
    requestId: request ? request.id : null,
    status: payload.status,
    message: payload.message || '',
    edited: annotations.length > 0,
    annotationCount: annotations.length,
    artifact: {
      type: request ? request.artifactType : null,
      title: request ? request.title || null : null,
      prompt: request ? request.prompt || null : null,
    },
    coordinateSpace,
    annotations,
    exports: exportsInfo,
    reviewedAt: new Date().toISOString(),
  };
}

function writeExports(requestId, exportPayload) {
  if (!requestId || !exportPayload) {
    return null;
  }

  const exportRoot = getExportRoot(requestId);
  const tmpRequestRoot = getRequestTmpDir(requestId);
  const exportsInfo = {
    directory: exportRoot,
    tmpDirectory: tmpRequestRoot,
    generatedFiles: [],
  };

  function registerFile(kind, filePath) {
    exportsInfo.generatedFiles.push({
      kind,
      path: filePath,
      name: path.basename(filePath),
      createdAt: new Date().toISOString(),
    });
  }

  if (exportPayload.overlaySvg) {
    const overlaySvgPath = path.join(exportRoot, 'annotations.svg');
    const tmpOverlaySvgPath = path.join(tmpRequestRoot, 'annotations.svg');
    fs.writeFileSync(overlaySvgPath, exportPayload.overlaySvg, 'utf8');
    fs.writeFileSync(tmpOverlaySvgPath, exportPayload.overlaySvg, 'utf8');
    exportsInfo.overlaySvgPath = overlaySvgPath;
    exportsInfo.tmpOverlaySvgPath = tmpOverlaySvgPath;
    registerFile('overlay-svg', tmpOverlaySvgPath);
  }

  if (exportPayload.annotatedImageDataUrl) {
    const annotatedImagePath = path.join(exportRoot, 'annotated-image.png');
    const tmpAnnotatedImagePath = path.join(tmpRequestRoot, 'annotated-image.png');
    const base64 = exportPayload.annotatedImageDataUrl.replace(
      /^data:image\/png;base64,/,
      ''
    );
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(annotatedImagePath, buffer);
    fs.writeFileSync(tmpAnnotatedImagePath, buffer);
    exportsInfo.annotatedImagePath = annotatedImagePath;
    exportsInfo.tmpAnnotatedImagePath = tmpAnnotatedImagePath;
    registerFile('annotated-image', tmpAnnotatedImagePath);
  }

  if (exportPayload.artifactSnapshotSvg) {
    const snapshotSvgPath = path.join(exportRoot, 'artifact-snapshot.svg');
    const tmpSnapshotSvgPath = path.join(tmpRequestRoot, 'artifact-snapshot.svg');
    fs.writeFileSync(snapshotSvgPath, exportPayload.artifactSnapshotSvg, 'utf8');
    fs.writeFileSync(tmpSnapshotSvgPath, exportPayload.artifactSnapshotSvg, 'utf8');
    exportsInfo.artifactSnapshotSvgPath = snapshotSvgPath;
    exportsInfo.tmpArtifactSnapshotSvgPath = tmpSnapshotSvgPath;
    registerFile('artifact-snapshot-svg', tmpSnapshotSvgPath);
  }

  return exportsInfo;
}

function saveResult(requestId, result) {
  const resultPath = getResultFilePath(requestId);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');

  if (requestId) {
    const tmpResultPath = path.join(getRequestTmpDir(requestId), 'result.json');
    fs.writeFileSync(tmpResultPath, JSON.stringify(result, null, 2), 'utf8');
  }

  return resultPath;
}

module.exports = {
  buildResult,
  writeExports,
  saveResult,
};
