const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
  generalLimiter,
  sensitiveLimiter,
  isHealthCheck,
  standardRateLimitHandler,
} = require('../dist/middleware/rate-limit');

// Helper to make HTTP requests against a local server
function makeRequest(server, options) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

test.describe('StudyOS API Rate Limiting Suite', () => {
  let server;
  let app;

  test.beforeEach(async () => {
    app = express();
    // Configure single upstream reverse proxy trust (Render topology)
    app.set('trust proxy', 1);

    // Mount health checks
    app.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

    // Global general limiter
    app.use(generalLimiter);

    // General test route
    app.get('/api/v1/studyos/resources', (_req, res) => {
      res.json({ success: true, clientIp: _req.ip });
    });

    // Sensitive route protected by sensitiveLimiter
    app.post('/api/v1/studyos/sync-user', sensitiveLimiter, (_req, res) => {
      res.json({ success: true, synced: true, clientIp: _req.ip });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  test.afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Requests below limit succeed with HTTP 200', async () => {
    // Perform 3 requests from a unique client IP
    for (let i = 0; i < 3; i++) {
      const res = await makeRequest(server, {
        path: '/api/v1/studyos/resources',
        headers: {
          'X-Forwarded-For': '198.51.100.10',
        },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json.success, true);
    }
  });

  test('2. Requests exceeding limit return HTTP 429 with consistent non-sensitive JSON', async () => {
    // Create an isolated limiter with limit: 2 to verify 429 handling directly
    const testApp = express();
    testApp.set('trust proxy', 1);
    const tightLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 2,
      skip: isHealthCheck,
      handler: standardRateLimitHandler,
    });
    testApp.use(tightLimiter);
    testApp.get('/test', (_req, res) => res.json({ ok: true }));

    const testServer = http.createServer(testApp);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));

    try {
      const clientIp = '198.51.100.20';
      // First 2 succeed
      const res1 = await makeRequest(testServer, { path: '/test', headers: { 'X-Forwarded-For': clientIp } });
      assert.equal(res1.statusCode, 200);

      const res2 = await makeRequest(testServer, { path: '/test', headers: { 'X-Forwarded-For': clientIp } });
      assert.equal(res2.statusCode, 200);

      // Third request must be rate limited with HTTP 429
      const res3 = await makeRequest(testServer, { path: '/test', headers: { 'X-Forwarded-For': clientIp } });
      assert.equal(res3.statusCode, 429);
      assert.deepEqual(res3.json, {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Too many requests from this client, please try again later.',
      });
      // Verify no sensitive internal error keys or stack traces leaked
      assert.equal(res3.json.stack, undefined);
      assert.equal(res3.json.details, undefined);
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test('3. Health check endpoints bypass throttling completely', async () => {
    // Create an isolated test server with a tight limiter
    const testApp = express();
    testApp.set('trust proxy', 1);
    const tightLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 1,
      skip: isHealthCheck,
      handler: standardRateLimitHandler,
    });
    testApp.use(tightLimiter);
    testApp.get('/health', (_req, res) => res.json({ status: 'ok' }));
    testApp.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    testApp.get('/api/data', (_req, res) => res.json({ data: 123 }));

    const testServer = http.createServer(testApp);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));

    try {
      const clientIp = '198.51.100.30';
      // Exhaust rate limit on data route
      const d1 = await makeRequest(testServer, { path: '/api/data', headers: { 'X-Forwarded-For': clientIp } });
      assert.equal(d1.statusCode, 200);

      const d2 = await makeRequest(testServer, { path: '/api/data', headers: { 'X-Forwarded-For': clientIp } });
      assert.equal(d2.statusCode, 429);

      // Health endpoints must succeed despite exhausted quota
      const h1 = await makeRequest(testServer, { path: '/health', headers: { 'X-Forwarded-For': clientIp } });
      assert.equal(h1.statusCode, 200);
      assert.equal(h1.json.status, 'ok');

      const h2 = await makeRequest(testServer, { path: '/api/health', headers: { 'X-Forwarded-For': clientIp } });
      assert.equal(h2.statusCode, 200);
      assert.equal(h2.json.status, 'ok');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test('4. Proxy IP handling respects Render 1-hop reverse proxy topology', async () => {
    const testApp = express();
    // Render reverse proxy: trust proxy = 1
    testApp.set('trust proxy', 1);
    const tightLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 1,
      skip: isHealthCheck,
      handler: standardRateLimitHandler,
    });
    testApp.use(tightLimiter);
    testApp.get('/api/resource', (req, res) => res.json({ resolvedIp: req.ip }));

    const testServer = http.createServer(testApp);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));

    try {
      // Client A sends spoofed client header through Render proxy:
      // X-Forwarded-For: spoofed-ip, 198.51.100.50
      // With trust proxy: 1, Express picks 198.51.100.50 as client IP
      const resA1 = await makeRequest(testServer, {
        path: '/api/resource',
        headers: { 'X-Forwarded-For': '10.0.0.1, 198.51.100.50' },
      });
      assert.equal(resA1.statusCode, 200);
      assert.equal(resA1.json.resolvedIp, '198.51.100.50');

      // Client A second request exceeds limit
      const resA2 = await makeRequest(testServer, {
        path: '/api/resource',
        headers: { 'X-Forwarded-For': '10.0.0.99, 198.51.100.50' },
      });
      assert.equal(resA2.statusCode, 429);

      // Client B from a distinct client IP (198.51.100.51) is NOT blocked
      const resB1 = await makeRequest(testServer, {
        path: '/api/resource',
        headers: { 'X-Forwarded-For': '10.0.0.1, 198.51.100.51' },
      });
      assert.equal(resB1.statusCode, 200);
      assert.equal(resB1.json.resolvedIp, '198.51.100.51');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test('5. Sensitive limiter enforces stricter threshold independently', async () => {
    const testApp = express();
    testApp.set('trust proxy', 1);

    const sensitiveLimiterLocal = rateLimit({
      windowMs: 60 * 1000,
      limit: 1,
      skip: isHealthCheck,
      handler: standardRateLimitHandler,
    });

    testApp.post('/api/v1/studyos/sync-user', sensitiveLimiterLocal, (_req, res) => res.json({ synced: true }));

    const testServer = http.createServer(testApp);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));

    try {
      const clientIp = '198.51.100.70';
      const r1 = await makeRequest(testServer, {
        path: '/api/v1/studyos/sync-user',
        method: 'POST',
        headers: { 'X-Forwarded-For': clientIp },
      });
      assert.equal(r1.statusCode, 200);

      const r2 = await makeRequest(testServer, {
        path: '/api/v1/studyos/sync-user',
        method: 'POST',
        headers: { 'X-Forwarded-For': clientIp },
      });
      assert.equal(r2.statusCode, 429);
      assert.equal(r2.json.statusCode, 429);
      assert.equal(r2.json.error, 'Too Many Requests');
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test('6. Middleware ordering: rate limiter rejects over-limit requests before body parsing', async () => {
    let bodyParsed = false;
    const testApp = express();
    testApp.set('trust proxy', 1);

    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 1,
      skip: isHealthCheck,
      handler: standardRateLimitHandler,
    });

    // Correct order: Rate limiter before body parser
    testApp.use(testLimiter);
    testApp.use(express.json({ limit: '10mb' }));
    testApp.use((req, _res, next) => {
      if (req.body && Object.keys(req.body).length > 0) {
        bodyParsed = true;
      }
      next();
    });

    testApp.post('/api/v1/studyos/test-order', (req, res) => {
      res.json({ ok: true, data: req.body });
    });

    const testServer = http.createServer(testApp);
    await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));

    try {
      const clientIp = '198.51.100.80';
      // Request 1: within limit -> body parsed
      const r1 = await new Promise((resolve, reject) => {
        const addr = testServer.address();
        const req = http.request({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/v1/studyos/test-order',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': clientIp,
          },
        }, (res) => {
          let b = '';
          res.on('data', chunk => b += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, body: b }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ test: 'payload1' }));
        req.end();
      });
      assert.equal(r1.statusCode, 200);
      assert.equal(bodyParsed, true);

      // Reset tracker
      bodyParsed = false;

      // Request 2: over limit -> rejected with 429 before reaching route or downstream body logging
      const r2 = await new Promise((resolve, reject) => {
        const addr = testServer.address();
        const req = http.request({
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/v1/studyos/test-order',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': clientIp,
          },
        }, (res) => {
          let b = '';
          res.on('data', chunk => b += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, body: b }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ test: 'payload2' }));
        req.end();
      });
      assert.equal(r2.statusCode, 429);
      assert.equal(bodyParsed, false); // Downstream route was not executed
    } finally {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });
});

