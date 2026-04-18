'use strict';

const fs = require('fs');
const { getStateFilePath } = require('../shared/paths');

function createStateStore() {
  const stateFilePath = getStateFilePath();

  function persist({ activeRequest, pendingQueue, requests }) {
    const payload = {
      activeRequestId: activeRequest ? activeRequest.id : null,
      pendingQueueIds: pendingQueue.map((record) => record.id),
      requests: Array.from(requests.values()).map((record) => ({
        id: record.id,
        status: record.status,
        request: record.request,
        createdAt: record.createdAt,
        enqueuedAt: record.enqueuedAt,
        startedAt: record.startedAt || null,
        completedAt: record.completedAt || null,
        error: record.error || null,
        result: record.result || null,
      })),
    };

    fs.writeFileSync(stateFilePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  function restore() {
    if (!fs.existsSync(stateFilePath)) {
      return null;
    }

    const raw = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    if (!Array.isArray(raw.requests)) {
      return null;
    }

    return raw;
  }

  return {
    persist,
    restore,
    stateFilePath,
  };
}

module.exports = {
  createStateStore,
};
