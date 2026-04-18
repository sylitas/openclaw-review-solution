'use strict';

const { buildResult, writeExports } = require('../shared/result');
const { createRecord } = require('./record-utils');

function createQueueManager({ saveResult, createFailureResult, stateStore, onActiveRequest }) {
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

  function finishRecord(record, status, result, errorMessage) {
    record.status = status;
    record.completedAt = new Date().toISOString();
    record.result = result || null;
    record.error = errorMessage || null;

    if (result) {
      saveResult(record.id, result);
    }

    persistState();
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

    finishRecord(activeRequest, result.status, result, null);
    activeRequest = null;
    maybeStartNext();

    return result;
  }

  function failActiveRequest(message) {
    if (!activeRequest) {
      return;
    }

    const result = createFailureResult(activeRequest.request, message);
    finishRecord(activeRequest, 'failed', result, message);
    activeRequest = null;
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
