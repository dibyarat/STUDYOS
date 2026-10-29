const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// Mock Firebase Admin module before importing routes
const fbModule = require('../dist/lib/firebase');

fbModule.getFirebaseAuth = () => ({
  verifyIdToken: async (token) => {
    if (token === 'token-alice') {
      return { uid: 'user-alice', email: 'alice@college.edu' };
    }
    if (token === 'token-bob') {
      return { uid: 'user-bob', email: 'bob@college.edu' };
    }
    if (token === 'token-eve') {
      return { uid: 'user-eve', email: 'eve@college.edu' };
    }
    throw new Error('Invalid authentication token');
  },
});

const { prisma } = require('../dist/lib/prisma');
const teamsRouter = require('../dist/routes/teams').default;
const conversationsRouter = require('../dist/routes/conversations').default;
const helpServicesRouter = require('../dist/routes/help-services').default;

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

test('StudyOS Comprehensive Authorization Boundaries Suite (Teams, Help, Messages)', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/teams', teamsRouter);
  app.use('/conversations', conversationsRouter);
  app.use('/help-services', helpServicesRouter);

  let server;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  // Seed users Alice, Bob, and Eve
  try {
    await prisma.user.upsert({
      where: { id: 'user-alice' },
      update: {},
      create: { id: 'user-alice', name: 'Alice Smith', email: 'alice@college.edu', role: 'STUDENT' },
    });
    await prisma.user.upsert({
      where: { id: 'user-bob' },
      update: {},
      create: { id: 'user-bob', name: 'Bob Jones', email: 'bob@college.edu', role: 'STUDENT' },
    });
    await prisma.user.upsert({
      where: { id: 'user-eve' },
      update: {},
      create: { id: 'user-eve', name: 'Eve Hacker', email: 'eve@college.edu', role: 'STUDENT' },
    });
  } catch (err) {
    console.warn('User seed note:', err.message);
  }

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      if (teamId) await prisma.teamPost.delete({ where: { id: teamId } }).catch(() => {});
      if (helpServiceId) await prisma.helpService.delete({ where: { id: helpServiceId } }).catch(() => {});
      await prisma.user.delete({ where: { id: 'user-bob' } }).catch(() => {});
      await prisma.user.delete({ where: { id: 'user-eve' } }).catch(() => {});
    } catch {}
  });

  let teamId = null;
  let helpServiceId = null;

  // 1. Teams Authorization Tests
  await t.test('1. Alice creates a valid team post', async () => {
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/teams',
      headers: { Authorization: 'Bearer token-alice' },
      body: {
        title: 'Hackathon AI Vision Team',
        type: 'HACKATHON',
        description: 'Building an interactive AI vision assistant for college hackathon',
        teamSize: 4,
        roles: [
          { title: 'Frontend Developer', responsibilities: 'React & UI polish', requiredSkills: 'React, CSS', openings: 2 },
          { title: 'ML Engineer', responsibilities: 'Model tuning', requiredSkills: 'Python, PyTorch', openings: 1 },
        ],
      },
    });

    assert.equal(res.statusCode, 201, `Expected 201 but got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.teamPost);
    assert.equal(res.body.teamPost.creatorId, 'user-alice');
    teamId = res.body.teamPost.id;
  });

  await t.test('2. Eve cannot edit or delete Alice’s team post (HTTP 403)', async () => {
    assert.ok(teamId);
    
    // Eve tries to edit Alice's team
    const editRes = await makeRequest(server, {
      method: 'PUT',
      path: `/teams/${teamId}`,
      headers: { Authorization: 'Bearer token-eve' },
      body: { title: 'Hacked Team Title' },
    });
    assert.equal(editRes.statusCode, 403, 'Non-owner must be rejected with 403 on edit');

    // Eve tries to delete Alice's team
    const deleteRes = await makeRequest(server, {
      method: 'DELETE',
      path: `/teams/${teamId}`,
      headers: { Authorization: 'Bearer token-eve' },
    });
    assert.equal(deleteRes.statusCode, 403, 'Non-owner must be rejected with 403 on delete');
  });

  await t.test('3. Bob applies to Alice’s team post and can withdraw (HTTP 200/201)', async () => {
    assert.ok(teamId);

    // Bob applies
    const applyRes = await makeRequest(server, {
      method: 'POST',
      path: `/teams/${teamId}/requests`,
      headers: { Authorization: 'Bearer token-bob' },
      body: {
        role: 'Frontend Developer',
        skills: 'React, TypeScript, CSS',
        contribution: 'I will build the frontend dashboard and integrate the API',
      },
    });
    assert.equal(applyRes.statusCode, 201, `Expected 201 but got ${applyRes.statusCode}: ${JSON.stringify(applyRes.body)}`);
    const requestId = applyRes.body.request.id;
    assert.ok(requestId);

    // Eve cannot decision Bob's request (HTTP 403)
    const eveDecision = await makeRequest(server, {
      method: 'PATCH',
      path: `/teams/${teamId}/requests/${requestId}`,
      headers: { Authorization: 'Bearer token-eve' },
      body: { status: 'ACCEPTED' },
    });
    assert.equal(eveDecision.statusCode, 403);

    // Bob can withdraw his own request
    const withdrawRes = await makeRequest(server, {
      method: 'POST',
      path: `/teams/${teamId}/requests/${requestId}/withdraw`,
      headers: { Authorization: 'Bearer token-bob' },
    });
    assert.equal(withdrawRes.statusCode, 200);
    assert.equal(withdrawRes.body.success, true);
  });

  // 2. Help Services Authorization Tests
  await t.test('4. Alice creates a help service; Eve cannot edit or delete it (HTTP 403)', async () => {
    // Alice creates service
    const createRes = await makeRequest(server, {
      method: 'POST',
      path: '/help-services',
      headers: { Authorization: 'Bearer token-alice' },
      body: {
        title: 'Data Structures & Algorithms Tutoring',
        description: 'One-on-one session on trees and dynamic programming',
        category: 'TUTORING',
        skills: 'DSA, LeetCode, Java',
        isPaid: false,
      },
    });
    assert.equal(createRes.statusCode, 201, `Expected 201 but got ${createRes.statusCode}: ${JSON.stringify(createRes.body)}`);
    helpServiceId = createRes.body.helpService.id;
    assert.ok(helpServiceId);

    // Eve tries to edit Alice's service
    const eveEdit = await makeRequest(server, {
      method: 'PUT',
      path: `/help-services/${helpServiceId}`,
      headers: { Authorization: 'Bearer token-eve' },
      body: { title: 'Compromised Help Service' },
    });
    assert.equal(eveEdit.statusCode, 403);

    // Eve tries to delete Alice's service
    const eveDelete = await makeRequest(server, {
      method: 'DELETE',
      path: `/help-services/${helpServiceId}`,
      headers: { Authorization: 'Bearer token-eve' },
    });
    assert.equal(eveDelete.statusCode, 403);
  });

  // 3. Conversation & Messaging Authorization Tests
  await t.test('5. Non-members cannot read or send messages in arbitrary conversations (HTTP 403)', async () => {
    // Eve tries to read messages from an unauthorized/non-existent conversation
    const readRes = await makeRequest(server, {
      method: 'GET',
      path: '/conversations/conv-non-member/messages',
      headers: { Authorization: 'Bearer token-eve' },
    });
    assert.equal(readRes.statusCode, 403, 'Non-member must receive 403 on read');

    // Eve tries to send a message into unauthorized conversation
    const sendRes = await makeRequest(server, {
      method: 'POST',
      path: '/conversations/conv-non-member/messages',
      headers: { Authorization: 'Bearer token-eve' },
      body: { content: 'Unauthorized probe message' },
    });
    assert.equal(sendRes.statusCode, 403, 'Non-member must receive 403 on post message');
  });
});
