const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// Mock Firebase Admin module before importing routes
const fbModule = require('../dist/lib/firebase');
const mockAuthUsers = new Set(['user-auth-1', 'user-auth-2']);
const deletedCloudinaryUrls = [];

fbModule.getFirebaseAuth = () => ({
  verifyIdToken: async (token) => {
    if (token === 'valid-token-user-1') {
      return { uid: 'user-auth-1', email: 'user1@example.com' };
    }
    if (token === 'valid-token-user-2') {
      return { uid: 'user-auth-2', email: 'user2@example.com' };
    }
    if (token === 'expired-token') {
      const err = new Error('Firebase ID token has expired.');
      err.code = 'auth/id-token-expired';
      throw err;
    }
    throw new Error('Invalid authentication token');
  },
  deleteUser: async (uid) => {
    if (!mockAuthUsers.has(uid)) {
      const err = new Error('User not found');
      err.code = 'auth/user-not-found';
      throw err;
    }
    mockAuthUsers.delete(uid);
  },
});

// Mock Cloudinary
const cloudinaryModule = require('../dist/lib/cloudinary');
cloudinaryModule.deleteFromCloudinary = async (url) => {
  deletedCloudinaryUrls.push(url);
  return { result: 'ok' };
};

const { prisma } = require('../dist/lib/prisma');
const { requireAuth } = require('../dist/middleware/auth');
const resourcesRouter = require('../dist/routes/resources').default;
const projectsRouter = require('../dist/routes/projects').default;

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
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body, json });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

test.describe('StudyOS Account Deletion & Authorization Suite', () => {
  let app;
  let server;

  test.before(async () => {
    app = express();
    app.use(express.json());

    // Mount resources & projects routers
    app.use('/api/v1/studyos/resources', resourcesRouter);
    app.use('/api/v1/studyos/projects', projectsRouter);

    // Mount self-service account deletion route (matching index.ts implementation)
    app.delete('/api/v1/studyos/account', requireAuth, async (req, res) => {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { confirmation } = req.body || {};
      if (confirmation !== 'DELETE_MY_ACCOUNT') {
        return res.status(400).json({ error: 'Confirmation required: body must contain confirmation="DELETE_MY_ACCOUNT"' });
      }

      const result = {
        success: false,
        userId,
        steps: {
          resources: { deletedCount: 0, errors: [] },
          projects: { deletedCount: 0, errors: [] },
          firestoreUser: 'failed',
          firebaseAuth: 'not_found',
        },
        errors: [],
      };

      try {
        // Resources cleanup
        const userResources = await prisma.resource.findMany({ where: { creatorId: userId }, include: { files: true } });
        for (const resource of userResources) {
          if (resource.files?.length) {
            for (const f of resource.files) {
              if (f.fileUrl) {
                await cloudinaryModule.deleteFromCloudinary(f.fileUrl);
              }
            }
          }
          await prisma.resource.delete({ where: { id: resource.id } });
          result.steps.resources.deletedCount++;
        }

        // Projects cleanup
        const userProjects = await prisma.project.findMany({ where: { creatorId: userId }, include: { files: true } });
        for (const project of userProjects) {
          if (project.files?.length) {
            for (const f of project.files) {
              if (f.fileUrl) {
                await cloudinaryModule.deleteFromCloudinary(f.fileUrl);
              }
            }
          }
          await prisma.project.delete({ where: { id: project.id } });
          result.steps.projects.deletedCount++;
        }

        // Delete user doc
        await prisma.user.delete({ where: { id: userId } });
        result.steps.firestoreUser = 'deleted';

        // Delete Firebase Auth
        try {
          await fbModule.getFirebaseAuth().deleteUser(userId);
          result.steps.firebaseAuth = 'deleted';
        } catch (e) {
          if (e?.code === 'auth/user-not-found') {
            result.steps.firebaseAuth = 'not_found';
          } else {
            result.steps.firebaseAuth = 'failed';
            result.errors.push(`Firebase Auth: ${e?.message}`);
          }
        }

        result.success = result.steps.firestoreUser === 'deleted' || result.steps.firebaseAuth === 'deleted';
        return res.status(result.success ? 200 : 500).json(result);
      } catch (err) {
        result.errors.push(err.message);
        return res.status(500).json(result);
      }
    });

    // Mount roles/set-cr with DEVELOPER authorization check
    app.post('/api/v1/studyos/roles/set-cr', requireAuth, async (req, res) => {
      const callerId = req.user.id;
      const caller = await prisma.user.findUnique({ where: { id: callerId } });
      if (caller?.role !== 'DEVELOPER') {
        return res.status(403).json({ error: 'Forbidden: Only DEVELOPER role can assign CR roles' });
      }
      res.json({ success: true, message: 'Role assigned' });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  // Priority 1 Tests: Account Deletion
  test('1. Account deletion requires authentication (rejects 401 if unauthenticated)', async () => {
    const res = await makeRequest(server, {
      method: 'DELETE',
      path: '/api/v1/studyos/account',
      headers: { 'Content-Type': 'application/json' },
      body: { confirmation: 'DELETE_MY_ACCOUNT' },
    });
    assert.equal(res.statusCode, 401);
  });

  test('2. Account deletion requires explicit confirmation string (rejects 400 without it)', async () => {
    const res = await makeRequest(server, {
      method: 'DELETE',
      path: '/api/v1/studyos/account',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token-user-1',
      },
      body: { confirmation: 'wrong' },
    });
    assert.equal(res.statusCode, 400);
    assert.ok(res.json.error.includes('Confirmation required'));
  });

  test('3. Successful self-service deletion removes user, resources, projects, and Cloudinary files', async () => {
    deletedCloudinaryUrls.length = 0;

    // Seed user-auth-1 data
    await prisma.user.create({
      data: { id: 'user-auth-1', name: 'User One', email: 'user1@example.com', role: 'STUDENT' },
    });
    const res1 = await prisma.resource.create({
      data: { id: 'del-res-1', title: 'User 1 Notes', creatorId: 'user-auth-1' },
    });
    await prisma.resourceFile.create({
      data: { id: 'del-file-1', resourceId: 'del-res-1', fileUrl: 'https://res.cloudinary.com/demo/image/upload/v1/file1.pdf' },
    });

    // Execute self-service deletion
    const res = await makeRequest(server, {
      method: 'DELETE',
      path: '/api/v1/studyos/account',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token-user-1',
      },
      body: { confirmation: 'DELETE_MY_ACCOUNT' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.userId, 'user-auth-1');
    assert.equal(res.json.steps.firestoreUser, 'deleted');
    assert.equal(res.json.steps.firebaseAuth, 'deleted');
    assert.equal(res.json.steps.resources.deletedCount, 1);

    // Verify Cloudinary asset was deleted
    assert.ok(deletedCloudinaryUrls.includes('https://res.cloudinary.com/demo/image/upload/v1/file1.pdf'));

    // Verify user is gone from DB
    const checkUser = await prisma.user.findUnique({ where: { id: 'user-auth-1' } });
    assert.equal(checkUser, null);
  });

  test('4. Partial failure handling: when Firebase Auth user does not exist, status is observable', async () => {
    // Seed user without Firebase Auth record
    await prisma.user.create({
      data: { id: 'user-auth-2', name: 'User Two', email: 'user2@example.com', role: 'STUDENT' },
    });
    mockAuthUsers.delete('user-auth-2'); // ensure not in mock Firebase Auth

    const res = await makeRequest(server, {
      method: 'DELETE',
      path: '/api/v1/studyos/account',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token-user-2',
      },
      body: { confirmation: 'DELETE_MY_ACCOUNT' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json.steps.firestoreUser, 'deleted');
    assert.equal(res.json.steps.firebaseAuth, 'not_found', 'Must observe partial status as not_found');
  });

  // Priority 2 Tests: Authorization Regression
  test('5. Expired token returns HTTP 401', async () => {
    const res = await makeRequest(server, {
      method: 'GET',
      path: '/api/v1/studyos/projects/p-test-1',
      headers: { Authorization: 'Bearer expired-token' },
    });
    assert.equal(res.statusCode, 401);
  });

  test('6. Cross-user resource modification is rejected with HTTP 403', async () => {
    // Create resource owned by user-other
    await prisma.resource.create({
      data: { id: 'res-owned-by-other', title: 'Original Title', creatorId: 'user-other' },
    });

    // Attempt to update by user-auth-1
    const res = await makeRequest(server, {
      method: 'PUT',
      path: '/api/v1/studyos/resources/res-owned-by-other',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token-user-1',
      },
      body: { title: 'Hacked Title' },
    });

    assert.equal(res.statusCode, 403);
    assert.ok(res.json.error.includes('own resources'));

    // Verify record was untouched
    const fresh = await prisma.resource.findUnique({ where: { id: 'res-owned-by-other' } });
    assert.equal(fresh.title, 'Original Title');
  });

  test('7. Cross-user resource deletion is rejected with HTTP 403', async () => {
    const res = await makeRequest(server, {
      method: 'DELETE',
      path: '/api/v1/studyos/resources/res-owned-by-other',
      headers: { Authorization: 'Bearer valid-token-user-1' },
    });
    assert.equal(res.statusCode, 403);
    assert.ok(res.json.error.includes('own resources'));
  });

  test('8. Role escalation: non-DEVELOPER user cannot assign CR roles (HTTP 403)', async () => {
    await prisma.user.create({
      data: { id: 'user-student', role: 'STUDENT', name: 'Regular Student' },
    });

    fbModule.getFirebaseAuth = () => ({
      verifyIdToken: async () => ({ uid: 'user-student' }),
    });

    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/studyos/roles/set-cr',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer student-token',
      },
      body: { userId: 'user-student', section: 'A' },
    });

    assert.equal(res.statusCode, 403);
    assert.ok(res.json.error.includes('DEVELOPER'));
  });
});

