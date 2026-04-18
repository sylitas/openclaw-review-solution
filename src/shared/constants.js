'use strict';

const DAEMON_HOST = process.env.REVIEWD_HOST || '127.0.0.1';
const DAEMON_PORT = Number(process.env.REVIEWD_PORT || 43129);
const REQUEST_POLL_INTERVAL_MS = Number(process.env.REVIEWD_POLL_MS || 750);
const APP_NAME = 'openclaw-review-solution';

module.exports = {
  APP_NAME,
  DAEMON_HOST,
  DAEMON_PORT,
  REQUEST_POLL_INTERVAL_MS,
};
