'use strict';

const { buildResult, writeExports } = require('../shared/result');
const { registerRequestOutputs } = require('../shared/artifact-registry');
const { getRequestTmpDir } = require('../shared/paths');
const { createRecord } = require('./record-utils');

function createQueueManager({ saveResult, createFailureResult, stateStore, onActiveRequest }) {
  function registerRequestResult(record, result, generatedFiles = []) {
    if (!record || !result) {
      return;
    }

    registerRequestOutputs(record.request, result, [
      {
        kind: 'result-json',
        path: `${getRequestTmpDir(record.id)}/result.json`,
        name: 'result.json',
        createdAt: result.reviewedAt,
      },
      ...generatedFiles,
    ]);
  }

  let activeRequest = null;
  let pendingQueue = [];
  const requests = new Map();

  function persistState() {
    stateStore.persist({ activeRequest, pendingQueue, requests });
  }

  function maybeStartNext() {
    if (activeRequest || pendingQueue.length === 0) {
      return;
    }

    activeRequest = pendingQueue.shift();
    activeRequest.status = 'active';
    activeRequest.startedAt = new Date().toISOString();
    persistState();
    onActiveRequest(activeRequest);
  }

  function restore() {
    let raw = null;
    try {
      raw = stateStore.restore();
    } catch (error) {
      console.error(`[reviewd] Failed to restore state: ${error.message}`);
      return;
    }

    if (!raw) {
      return;
    }

    raw.requests.forEach((record) => {
      const hydrated = {
        id: record.id,
        status: record.status,
        request: record.request,
        createdAt: record.createdAt,
        enqueuedAt: record.enqueuedAt,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        error: record.error || null,
        result: record.result || null,
      };

      if (hydrated.status === 'active') {
        hydrated.status = 'failed';
        hydrated.completedAt = new Date().toISOString();
        hydrated.error = 'Daemon restarted while request was active.';
        hydrated.result = createFailureResult(hydrated.request, hydrated.error);
        saveResult(hydrated.id, hydrated.result);
        registerRequestResult(hydrated, hydrated.result);
      }

      requests.set(hydrated.id, hydrated);
    });

    pendingQueue = (Array.isArray(raw.pendingQueueIds) ? raw.pendingQueueIds : [])
      .map((id) => requests.get(id))
      .filter((record) => record && record.status === 'queued');
  }

  function initialize() {
    restore();
    persistState();
    maybeStartNext();
  }

  function enqueue(request) {
    const record = createRecord(request);
    requests.set(record.id, record);
    pendingQueue.push(record);
    persistState();
    maybeStartNext();
    return record;
  }

  function finishRecord(record, status, result, errorMessage, options = {}) {
    record.status = status;
    record.completedAt = new Date().toISOString();
    record.result = result || null;
    record.error = errorMessage || null;

    if (result) {
      saveResult(record.id, result);
      registerRequestResult(record, result, options.generatedFiles || []);
    }

    if (!options.skipPersist) {
      persistState();
    }
  }

  function completeActiveWithPayload(payload) {
    if (!activeRequest) {
      throw new Error('No active request to complete.');
    }

    const exportsInfo = writeExports(
      activeRequest.id,
      payload ? payload.exportPayload : null
    );
    const result = buildResult(activeRequest.request, payload || {}, exportsInfo);

    const completedRequest = activeRequest;
    finishRecord(completedRequest, result.status, result, null, {
      skipPersist: true,
      generatedFiles: (exportsInfo && exportsInfo.generatedFiles) || [],
    });
    activeRequest = null;
    persistState();
    maybeStartNext();

    return result;
  }

  function failActiveRequest(message) {
    if (!activeRequest) {
      return;
    }

    const failedRequest = activeRequest;
    const result = createFailureResult(failedRequest.request, message);
    finishRecord(failedRequest, 'failed', result, message, { skipPersist: true });
    activeRequest = null;
    persistState();
    maybeStartNext();
  }

  function getActiveRequest() {
    return activeRequest;
  }

  function getRequest(requestId) {
    return requests.get(requestId) || null;
  }

  function getQueuedCount() {
    return pendingQueue.length;
  }

  return {
    initialize,
    enqueue,
    completeActiveWithPayload,
    failActiveRequest,
    getActiveRequest,
    getRequest,
    getQueuedCount,
  };
}

module.exports = {
  createQueueManager,
};
