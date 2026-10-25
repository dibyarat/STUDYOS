const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Import built express app
const { app } = require('../dist/index');

function makePreflightRequest(server, origin) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/api/health',
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    }, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makeGetRequest(server, origin) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/api/health',
      method: 'GET',
      headers: origin ? { Origin: origin } : {},
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('StudyOS CORS and Security Headers Hardening Suite', async (t) => {
  let server;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  await t.test('1. Preflight from untrusted origin does NOT receive Access-Control-Allow-Origin', async () => {
    const res = await makePreflightRequest(server, 'https://untrusted.example');
    assert.equal(
      res.headers['access-control-allow-origin'],
      undefined,
      'Untrusted origin must not be granted Access-Control-Allow-Origin'
    );
  });

  await t.test('2. Preflight from legitimate StudyOS domain is granted CORS', async () => {
    const res = await makePreflightRequest(server, 'https://studyos-nu-three.vercel.app');
    assert.equal(
      res.headers['access-control-allow-origin'],
      'https://studyos-nu-three.vercel.app',
      'StudyOS production frontend origin must be allowed'
    );
  });

  await t.test('3. Preflight from local dev domain is granted CORS', async () => {
    const res = await makePreflightRequest(server, 'http://localhost:5173');
    assert.equal(
      res.headers['access-control-allow-origin'],
      'http://localhost:5173',
      'Local dev origin must be allowed'
    );
  });

  await t.test('4. Security headers are enforced on all responses', async () => {
    const res = await makeGetRequest(server, 'https://studyos-nu-three.vercel.app');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(res.headers['permissions-policy'], 'Permissions-Policy header must be present');
    assert.equal(res.headers['x-powered-by'], undefined, 'X-Powered-By header must be removed');
  });
});
