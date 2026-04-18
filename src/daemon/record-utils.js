'use strict';

const crypto = require('crypto');
const { buildResult } = require('../shared/result');

function createRecord(request) {
  const id = request.id || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  return {
    id,
    status: 'queued',
    request: { ...request, id },
    createdAt: request.createdAt || new Date().toISOString(),
    enqueuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
  };
}

function createFailureResult(request, message) {
  return buildResult(
    request,
    {
      status: 'failed',
      message,
      annotations: [],
      coordinateSpace: null,
    },
    null
  );
}

function toPublicRecord(record) {
  return {
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    enqueuedAt: record.enqueuedAt,
    startedAt: record.startedAt || null,
    completedAt: record.completedAt || null,
    artifactType: record.request.artifactType,
    title: record.request.title || null,
    prompt: record.request.prompt || null,
    result: record.result || null,
    error: record.error || null,
  };
}

module.exports = {
  createRecord,
  createFailureResult,
  toPublicRecord,
};
