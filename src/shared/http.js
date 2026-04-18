'use strict';

const http = require('http');
const { DAEMON_HOST, DAEMON_PORT } = require('./constants');

function requestJson(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: DAEMON_HOST,
        port: DAEMON_PORT,
        path: requestPath,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (error) {
              reject(new Error(`Invalid JSON response: ${error.message}`));
              return;
            }
          }

          if (res.statusCode >= 400) {
            const message = data && data.error ? data.error : `HTTP ${res.statusCode}`;
            const err = new Error(message);
            err.statusCode = res.statusCode;
            err.data = data;
            reject(err);
            return;
          }

          resolve({ statusCode: res.statusCode, data });
        });
      }
    );

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

module.exports = {
  requestJson,
};
