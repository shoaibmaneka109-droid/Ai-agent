/**
 * Minimal HTTPS GET/POST helper used by provider adapters.
 * Uses Node's built-in https module — no extra dependencies.
 */
const https = require('https');
const http = require('http');

const TIMEOUT_MS = 10_000;

/**
 * Makes an HTTP(S) request and returns { status, body, latencyMs }.
 * Never throws on HTTP error status — callers decide what counts as success.
 */
const request = (options, postBody = null) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const mod = options.protocol === 'http:' ? http : https;

    const req = mod.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: raw,
          latencyMs: Date.now() - start,
        });
      });
    });

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
    });

    req.on('error', (err) => reject(err));

    if (postBody) {
      req.write(postBody);
    }
    req.end();
  });
};

const get = (url, headers = {}) => {
  const u = new URL(url);
  return request({
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    method: 'GET',
    protocol: u.protocol,
    headers: { 'User-Agent': 'SecurePay/1.0', ...headers },
  });
};

const post = (url, body, headers = {}) => {
  const u = new URL(url);
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return request({
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search,
    method: 'POST',
    protocol: u.protocol,
    headers: {
      'User-Agent': 'SecurePay/1.0',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      ...headers,
    },
  }, bodyStr);
};

module.exports = { get, post };
