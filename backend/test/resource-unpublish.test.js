const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// Mock Firebase Admin module before importing routes
const fbModule = require('../dist/lib/firebase');

fbModule.getFirebaseAuth = () => ({
  verifyIdToken: async (token) => {
    if (token === 'valid-token-user-1') {
      return { uid: 'user-auth-1', email: 'user1@example.com' };
    }
    if (token === 'valid-token-user-2') {
      return { uid: 'user-auth-2', email: 'user2@example.com' };
    }
    throw new Error('Invalid authentication token');
  },
});

// Mock Cloudinary
const cloudinaryModule = require('../dist/lib/cloudinary');
cloudinaryModule.deleteFromCloudinary = async () => ({ result: 'ok' });

const { prisma } = require('../dist/lib/prisma');
const resourcesRouter = require('../dist/routes/resources').default;

function makeRequest(server, options) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : null;

    const headers = { ...options.headers };
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const reqOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers,
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json || data,
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('StudyOS Free Resource Creation and Unpublish Regression Suite', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/resources', resourcesRouter);

  let server;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  let createdResourceId = null;

  await t.test('1. Create a public free resource without price', async () => {
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/resources',
      headers: {
        Authorization: 'Bearer valid-token-user-1',
      },
      body: {
        title: 'Algorithms Lecture Notes - Free',
        description: 'Comprehensive study notes for algorithms exam',
        type: 'NOTE',
        subject: 'Algorithms',
        visibility: 'PUBLIC',
      },
    });

    assert.equal(res.statusCode, 201, `Expected 201 Created but received ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.resource, 'Expected resource object in response');
    assert.equal(res.body.resource.title, 'Algorithms Lecture Notes - Free');
    assert.equal(res.body.resource.visibility, 'PUBLIC');
    assert.equal(res.body.resource.price, null, 'Price should be initialized to null for free resources');
    createdResourceId = res.body.resource.id;
  });

  await t.test('2. Immediately unpublish the newly created free resource with visibility: PRIVATE', async () => {
    assert.ok(createdResourceId, 'Resource must have been created');
    
    // Test PUT /resources/:id with partial update { visibility: 'PRIVATE' }
    const res = await makeRequest(server, {
      method: 'PUT',
      path: `/resources/${createdResourceId}`,
      headers: {
        Authorization: 'Bearer valid-token-user-1',
      },
      body: {
        visibility: 'PRIVATE',
      },
    });

    assert.equal(res.statusCode, 200, `Expected 200 OK on unpublish but received ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.resource, 'Expected updated resource object');
    assert.equal(res.body.resource.visibility, 'PRIVATE', 'Resource visibility must update to PRIVATE');
    assert.equal(res.body.resource.price, null, 'Price should remain null');
  });

  await t.test('3. Verify that non-owner cannot access the unpublished private resource', async () => {
    assert.ok(createdResourceId, 'Resource must exist');

    const res = await makeRequest(server, {
      method: 'GET',
      path: `/resources/${createdResourceId}/files/dummy-file/stream`,
      headers: {
        Authorization: 'Bearer valid-token-user-2',
      },
    });

    // Should reject non-owner with 403 or 404 (private resource)
    assert.ok([403, 404].includes(res.statusCode), `Expected 403 or 404 for non-owner accessing private resource but got ${res.statusCode}`);
  });

  await t.test('4. Test PATCH /resources/:id can also toggle visibility without requiring price', async () => {
    assert.ok(createdResourceId, 'Resource must exist');

    // Toggle back to PUBLIC via PATCH
    const patchPublicRes = await makeRequest(server, {
      method: 'PATCH',
      path: `/resources/${createdResourceId}`,
      headers: {
        Authorization: 'Bearer valid-token-user-1',
      },
      body: {
        visibility: 'PUBLIC',
      },
    });

    assert.equal(patchPublicRes.statusCode, 200);
    assert.equal(patchPublicRes.body.resource.visibility, 'PUBLIC');

    // Toggle back to PRIVATE via PATCH
    const patchPrivateRes = await makeRequest(server, {
      method: 'PATCH',
      path: `/resources/${createdResourceId}`,
      headers: {
        Authorization: 'Bearer valid-token-user-1',
      },
      body: {
        visibility: 'PRIVATE',
      },
    });

    assert.equal(patchPrivateRes.statusCode, 200);
    assert.equal(patchPrivateRes.body.resource.visibility, 'PRIVATE');
  });
});
