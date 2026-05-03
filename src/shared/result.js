'use strict';

const fs = require('fs');
const path = require('path');
const { getExportRoot } = require('./paths');

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
  const exportsInfo = {
    directory: exportRoot,
  };

  if (exportPayload.overlaySvg) {
    const overlaySvgPath = path.join(exportRoot, 'annotations.svg');
    fs.writeFileSync(overlaySvgPath, exportPayload.overlaySvg, 'utf8');
    exportsInfo.overlaySvgPath = overlaySvgPath;
  }

  if (exportPayload.annotatedImageDataUrl) {
    const annotatedImagePath = path.join(exportRoot, 'annotated-image.png');
    const base64 = exportPayload.annotatedImageDataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(annotatedImagePath, Buffer.from(base64, 'base64'));
    exportsInfo.annotatedImagePath = annotatedImagePath;
  }

  if (exportPayload.artifactSnapshotSvg) {
    const snapshotSvgPath = path.join(exportRoot, 'artifact-snapshot.svg');
    fs.writeFileSync(snapshotSvgPath, exportPayload.artifactSnapshotSvg, 'utf8');
    exportsInfo.artifactSnapshotSvgPath = snapshotSvgPath;
  }

  return exportsInfo;
}

module.exports = {
  buildResult,
  writeExports,
};
