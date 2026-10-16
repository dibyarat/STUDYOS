const test = require('node:test');
const assert = require('node:assert/strict');

// In-memory mock Firestore storage
const mockStore = new Map(); // collectionName -> Map(id -> data)
const calls = []; // record of all calls

function getMockCollection(name) {
  let col = mockStore.get(name);
  if (!col) {
    col = new Map();
    mockStore.set(name, col);
  }
  return col;
}

// Build mock Firestore DB
function createMockDb() {
  return {
    collection(colName) {
      calls.push({ op: 'collection', col: colName });
      const colMap = getMockCollection(colName);

      return {
        doc(docId) {
          calls.push({ op: 'doc', col: colName, id: docId });
          return {
            async get() {
              calls.push({ op: 'doc.get', col: colName, id: docId });
              const data = colMap.get(docId);
              return {
                exists: !!data,
                id: docId,
                data: () => data ? { ...data } : undefined,
              };
            },
            async set(data, options) {
              calls.push({ op: 'doc.set', col: colName, id: docId, data, options });
              const existing = colMap.get(docId) || {};
              const merged = options?.merge ? { ...existing, ...data } : data;
              colMap.set(docId, merged);
            },
            async delete() {
              calls.push({ op: 'doc.delete', col: colName, id: docId });
              colMap.delete(docId);
            },
          };
        },
        where(field, op, val) {
          calls.push({ op: 'where', col: colName, field, comparison: op, val });
          const conditions = [{ field, op, val }];

          const queryObj = {
            where(f, o, v) {
              conditions.push({ field: f, op: o, val: v });
              calls.push({ op: 'where', col: colName, field: f, comparison: o, val: v });
              return queryObj;
            },
            limit(n) {
              calls.push({ op: 'limit', col: colName, limit: n });
              queryObj._limit = n;
              return queryObj;
            },
            orderBy(f, dir) {
              calls.push({ op: 'orderBy', col: colName, field: f, dir });
              return queryObj;
            },
            count() {
              return {
                async get() {
                  calls.push({ op: 'count.get', col: colName });
                  let docs = Array.from(colMap.values());
                  for (const c of conditions) {
                    if (c.op === '==') docs = docs.filter(d => d[c.field] === c.val);
                    if (c.op === 'in') docs = docs.filter(d => Array.isArray(c.val) && c.val.includes(d[c.field]));
                  }
                  return { data: () => ({ count: docs.length }) };
                }
              };
            },
            async get() {
              calls.push({ op: 'query.get', col: colName, conditions });
              let docs = Array.from(colMap.values());
              for (const c of conditions) {
                if (c.op === '==') docs = docs.filter(d => d[c.field] === c.val);
                if (c.op === 'in') docs = docs.filter(d => Array.isArray(c.val) && c.val.includes(d[c.field]));
              }
              if (queryObj._limit) docs = docs.slice(0, queryObj._limit);
              return {
                docs: docs.map(d => ({
                  id: d.id,
                  data: () => ({ ...d }),
                })),
              };
            },
          };
          return queryObj;
        },
        limit(n) {
          calls.push({ op: 'limit', col: colName, limit: n });
          return {
            async get() {
              calls.push({ op: 'collection.limit.get', col: colName, limit: n });
              let docs = Array.from(colMap.values()).slice(0, n);
              return {
                docs: docs.map(d => ({ id: d.id, data: () => ({ ...d }) })),
              };
            },
          };
        },
        count() {
          return {
            async get() {
              calls.push({ op: 'collection.count.get', col: colName });
              return { data: () => ({ count: colMap.size }) };
            }
          };
        },
        async get() {
          calls.push({ op: 'collection.get', col: colName });
          return {
            docs: Array.from(colMap.values()).map(d => ({ id: d.id, data: () => ({ ...d }) })),
          };
        },
      };
    },
  };
}

// Intercept getFirebaseDb in dist/lib/firebase
const fbModule = require('../dist/lib/firebase');
fbModule.getFirebaseDb = () => createMockDb();

const { prisma, Prisma } = require('../dist/lib/prisma');

test('Firestore Query Optimization Suite', async (t) => {
  // Setup mock data
  const usersCol = getMockCollection('users');
  usersCol.set('user-1', { id: 'user-1', name: 'Alice Smith', email: 'alice@example.com', avatarUrl: 'alice.png' });
  usersCol.set('user-2', { id: 'user-2', name: 'Bob Jones', email: 'bob@example.com', avatarUrl: 'bob.png' });

  const resourcesCol = getMockCollection('resources');
  resourcesCol.set('res-1', { id: 'res-1', title: 'Calculus I Notes', description: 'Limits and derivatives', visibility: 'PUBLIC', creatorId: 'user-1', createdAt: '2026-10-01T10:00:00Z' });
  resourcesCol.set('res-2', { id: 'res-2', title: 'Physics II Labs', description: 'Electromagnetism', visibility: 'PUBLIC', creatorId: 'user-2', createdAt: '2026-10-02T10:00:00Z' });
  resourcesCol.set('res-3', { id: 'res-3', title: 'Private Draft', description: 'Secret formulas', visibility: 'PRIVATE', creatorId: 'user-1', createdAt: '2026-10-03T10:00:00Z' });

  const filesCol = getMockCollection('resource_files');
  filesCol.set('file-1', { id: 'file-1', resourceId: 'res-1', name: 'calc_syllabus.pdf', url: 'https://cdn.example.com/f1' });
  filesCol.set('file-2', { id: 'file-2', resourceId: 'res-1', name: 'limits_cheatsheet.pdf', url: 'https://cdn.example.com/f2' });
  filesCol.set('file-3', { id: 'file-3', resourceId: 'res-2', name: 'lab1_report.pdf', url: 'https://cdn.example.com/f3' });

  await t.test('1. findUnique performs targeted doc lookup without scanning entire collection', async () => {
    calls.length = 0;
    const user = await prisma.user.findUnique({
      where: { id: 'user-1' },
      select: { id: true, name: true }
    });

    assert.equal(user.id, 'user-1');
    assert.equal(user.name, 'Alice Smith');
    assert.equal(user.email, undefined); // pruned by select

    // Verify targeted doc lookup was performed and NO whole collection scan occurred
    const docGet = calls.find(c => c.op === 'doc.get' && c.col === 'users' && c.id === 'user-1');
    assert.ok(docGet, 'Targeted doc(id).get() must be called');

    const collectionGet = calls.find(c => c.op === 'collection.get' && c.col === 'users');
    assert.equal(collectionGet, undefined, 'Whole collection scan must NOT be performed');
  });

  await t.test('2. findUnique uses in-memory TTL cache on subsequent requests', async () => {
    calls.length = 0;
    // Calling findUnique again for user-1 should hit the cache
    const user = await prisma.user.findUnique({ where: { id: 'user-1' } });
    assert.equal(user.id, 'user-1');

    const docGet = calls.find(c => c.op === 'doc.get' && c.col === 'users');
    assert.equal(docGet, undefined, 'Repeated findUnique for same ID within TTL should hit cache with 0 reads');
  });

  await t.test('3. findMany with targeted equality filter pushes .where to Firestore', async () => {
    calls.length = 0;
    const files = await prisma.resourceFile.findMany({
      where: { resourceId: 'res-1' },
    });

    assert.equal(files.length, 2);
    assert.deepEqual(files.map(f => f.id).sort(), ['file-1', 'file-2']);

    // Verify .where('resourceId', '==', 'res-1') was passed to Firestore
    const whereCall = calls.find(c => c.op === 'where' && c.col === 'resource_files' && c.field === 'resourceId');
    assert.ok(whereCall, 'Firestore .where() filter must be applied');
    assert.equal(whereCall.comparison, '==');
    assert.equal(whereCall.val, 'res-1');

    const colScan = calls.find(c => c.op === 'collection.get' && c.col === 'resource_files');
    assert.equal(colScan, undefined, 'Whole collection scan must NOT be executed');
  });

  await t.test('4. findMany with search/contains correctly filters in-memory without losing matches', async () => {
    calls.length = 0;
    const results = await prisma.resource.findMany({
      where: {
        visibility: 'PUBLIC',
        title: { contains: 'calculus', mode: 'insensitive' },
      },
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'res-1');

    // Firestore query filtered on visibility == 'PUBLIC'
    const whereCall = calls.find(c => c.op === 'where' && c.col === 'resources' && c.field === 'visibility');
    assert.ok(whereCall, 'Firestore filter on visibility must be pushed to DB');
  });

  await t.test('5. findMany with explicit take and skip paginates accurately', async () => {
    calls.length = 0;
    const page1 = await prisma.resource.findMany({
      where: { visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 1,
    });

    assert.equal(page1.length, 1);
    assert.equal(page1[0].id, 'res-2'); // latest createdAt

    const page2 = await prisma.resource.findMany({
      where: { visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
      skip: 1,
      take: 1,
    });

    assert.equal(page2.length, 1);
    assert.equal(page2[0].id, 'res-1');
  });

  await t.test('6. Relation resolution uses targeted lookups rather than scanning collections', async () => {
    calls.length = 0;
    const resource = await prisma.resource.findUnique({
      where: { id: 'res-1' },
      include: {
        creator: { select: { id: true, name: true } },
        files: true,
      },
    });

    assert.ok(resource);
    assert.equal(resource.id, 'res-1');
    assert.equal(resource.creator?.id, 'user-1');
    assert.equal(resource.creator?.name, 'Alice Smith');
    assert.equal(resource.files?.length, 2);

    // Verify files were fetched using targeted where('resourceId', '==', 'res-1')
    const filesWhere = calls.find(c => c.op === 'where' && c.col === 'resource_files');
    assert.ok(filesWhere, 'Relation files must be fetched via targeted query');
    assert.equal(filesWhere.field, 'resourceId');
  });

  await t.test('7. count() uses native Firestore count aggregation for targeted queries', async () => {
    calls.length = 0;
    const totalFiles = await prisma.resourceFile.count({
      where: { resourceId: 'res-1' },
    });

    assert.equal(totalFiles, 2);
    const countCall = calls.find(c => c.op === 'count.get' && c.col === 'resource_files');
    assert.ok(countCall, 'Native aggregation count.get() must be called');
  });

  await t.test('8. CRUD mutations: create, update, delete update cache and persist properly', async () => {
    // Create
    const created = await prisma.resource.create({
      data: {
        id: 'res-test',
        title: 'New Chemistry Guide',
        visibility: 'PUBLIC',
        creatorId: 'user-1',
      },
    });
    assert.equal(created.id, 'res-test');
    assert.equal(created.title, 'New Chemistry Guide');

    // Update
    const updated = await prisma.resource.update({
      where: { id: 'res-test' },
      data: { title: 'Updated Chemistry Guide' },
    });
    assert.equal(updated.title, 'Updated Chemistry Guide');

    // Delete
    const deleted = await prisma.resource.delete({
      where: { id: 'res-test' },
    });
    assert.equal(deleted.id, 'res-test');

    // Verify delete error code P2025 on non-existent record
    await assert.rejects(
      async () => {
        await prisma.resource.delete({ where: { id: 'res-test' } });
      },
      (err) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, 'P2025');
        return true;
      }
    );
  });

  await t.test('9. findFirst returns single matching record or null', async () => {
    const firstPublic = await prisma.resource.findFirst({
      where: { visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(firstPublic);
    assert.equal(firstPublic.id, 'res-2');

    const notFound = await prisma.resource.findFirst({
      where: { id: 'non-existent-id' },
    });
    assert.equal(notFound, null);
  });

  await t.test('10. upsert updates existing record or creates new record', async () => {
    // Upsert update
    const updated = await prisma.user.upsert({
      where: { id: 'user-1' },
      update: { name: 'Alice W. Smith' },
      create: { id: 'user-1', name: 'Alice W. Smith', email: 'alice@example.com' },
    });
    assert.equal(updated.name, 'Alice W. Smith');

    // Upsert create
    const created = await prisma.user.upsert({
      where: { id: 'user-3' },
      update: { name: 'Charlie' },
      create: { id: 'user-3', name: 'Charlie Brown', email: 'charlie@example.com' },
    });
    assert.equal(created.id, 'user-3');
    assert.equal(created.name, 'Charlie Brown');
  });

  await t.test('11. aggregate and groupBy compute correct statistics', async () => {
    const ratingsCol = getMockCollection('resource_ratings');
    ratingsCol.set('r1', { id: 'r1', resourceId: 'res-1', rating: 5 });
    ratingsCol.set('r2', { id: 'r2', resourceId: 'res-1', rating: 3 });
    ratingsCol.set('r3', { id: 'r3', resourceId: 'res-2', rating: 4 });

    const agg = await prisma.resourceRating.aggregate({
      where: { resourceId: 'res-1' },
      _count: true,
      _avg: { rating: true },
    });
    assert.equal(agg._count, 2);
    assert.equal(agg._avg?.rating, 4);

    const groups = await prisma.resourceRating.groupBy({
      by: ['resourceId'],
      _count: true,
      _avg: true,
    });
    assert.equal(groups.length, 2);
  });

  await t.test('12. Composite unique key in where clause pushes targeted query', async () => {
    calls.length = 0;
    const savesCol = getMockCollection('resource_saves');
    savesCol.set('save-1', { id: 'save-1', userId: 'user-1', resourceId: 'res-1' });

    const save = await prisma.resourceSave.findFirst({
      where: {
        userId_resourceId: {
          userId: 'user-1',
          resourceId: 'res-1',
        },
      },
    });

    assert.ok(save);
    assert.equal(save.id, 'save-1');

    const userIdWhere = calls.find(c => c.op === 'where' && c.col === 'resource_saves' && c.field === 'userId');
    const resourceIdWhere = calls.find(c => c.op === 'where' && c.col === 'resource_saves' && c.field === 'resourceId');
    assert.ok(userIdWhere, 'userId equality should be pushed to Firestore');
    assert.ok(resourceIdWhere, 'resourceId equality should be pushed to Firestore');
  });

  await t.test('13. Filtered query failure does NOT trigger unbounded collection scan and propagates PrismaClientKnownRequestError', async () => {
    // Clear calls
    calls.length = 0;

    // Simulate a collection where query.get() throws FAILED_PRECONDITION
    const origDb = fbModule.getFirebaseDb();
    fbModule.getFirebaseDb = () => {
      const mock = origDb;
      const origCollection = mock.collection.bind(mock);
      return {
        ...mock,
        collection(colName) {
          const col = origCollection(colName);
          const origWhere = col.where.bind(col);
          return {
            ...col,
            where(...args) {
              const q = origWhere(...args);
              return {
                ...q,
                async get() {
                  const err = new Error('9 FAILED_PRECONDITION: The query requires an index.');
                  throw err;
                },
              };
            },
          };
        },
      };
    };

    // Filtered query must reject with PrismaClientKnownRequestError (code P2021)
    await assert.rejects(
      async () => {
        await prisma.resource.findMany({
          where: { visibility: 'PUBLIC' },
        });
      },
      (err) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError, 'Must throw PrismaClientKnownRequestError');
        assert.equal(err.code, 'P2021', 'Must map missing index error to P2021');
        assert.ok(err.message.includes('FAILED_PRECONDITION'), 'Error message must contain diagnostic details');
        return true;
      }
    );

    // CRITICAL ASSERTION: collection.get() must NEVER be called (zero unbounded collection scan)
    const unboundedColScan = calls.find(c => c.op === 'collection.get' && c.col === 'resources');
    assert.equal(unboundedColScan, undefined, 'A failed filtered query must NEVER trigger an unbounded collection scan');

    // Restore original mock
    fbModule.getFirebaseDb = () => origDb;
  });

  await t.test('14. Failed query with orderBy rejects silent fallback and raises P2021 to prevent data corruption', async () => {
    calls.length = 0;
    const instCol = getMockCollection('institutions');
    instCol.set('inst-1', { id: 'inst-1', name: 'University A' });
    instCol.set('inst-2', { id: 'inst-2', name: 'University B' });
    instCol.set('inst-3', { id: 'inst-3', name: 'University C' });

    // Simulate query.get() failure on orderBy for institutions
    const origDb = fbModule.getFirebaseDb();
    fbModule.getFirebaseDb = () => {
      const mock = origDb;
      const origCollection = mock.collection.bind(mock);
      return {
        ...mock,
        collection(colName) {
          const col = origCollection(colName);
          return {
            ...col,
            orderBy(...args) {
              return {
                limit(n) {
                  return {
                    async get() {
                      throw new Error('9 FAILED_PRECONDITION: Missing index for orderBy');
                    }
                  };
                }
              };
            }
          };
        }
      };
    };

    // Request with take: 2 and orderBy must NOT silently return an unordered arbitrary slice
    await assert.rejects(
      async () => {
        await prisma.institution.findMany({
          orderBy: { name: 'asc' },
          take: 2,
        });
      },
      (err) => {
        assert.ok(err instanceof Prisma.PrismaClientKnownRequestError);
        assert.equal(err.code, 'P2021', 'Must raise P2021 (missing index) error instead of returning incorrect data');
        return true;
      }
    );

    // Restore original mock
    fbModule.getFirebaseDb = () => origDb;
  });

  await t.test('15. In-memory sorting supports multi-key orderBy and stable ID tie-breaker', async () => {
    const resourcesCol = getMockCollection('resources');
    resourcesCol.set('res-sort-3', { id: 'res-sort-3', category: 'CS', rating: 4, title: 'C' });
    resourcesCol.set('res-sort-1', { id: 'res-sort-1', category: 'CS', rating: 5, title: 'A' });
    resourcesCol.set('res-sort-2', { id: 'res-sort-2', category: 'CS', rating: 5, title: 'B' });
    resourcesCol.set('res-sort-4', { id: 'res-sort-4', category: 'MATH', rating: 5, title: 'D' });

    // Multi-key sort: category asc, rating desc, tie-breaker id asc
    const results = await prisma.resource.findMany({
      where: {
        id: { in: ['res-sort-1', 'res-sort-2', 'res-sort-3', 'res-sort-4'] }
      },
      orderBy: [
        { category: 'asc' },
        { rating: 'desc' }
      ]
    });

    assert.equal(results.length, 4);
    // CS comes before MATH. Within CS, rating 5 comes before 4.
    // For rating 5 tie ('res-sort-1' vs 'res-sort-2'), tie-breaker id asc gives res-sort-1 then res-sort-2.
    assert.equal(results[0].id, 'res-sort-1');
    assert.equal(results[1].id, 'res-sort-2');
    assert.equal(results[2].id, 'res-sort-3');
    assert.equal(results[3].id, 'res-sort-4');
  });

  await t.test('16. Sorting occurs before pagination: skip and take slice correctly ordered set', async () => {
    const itemsCol = getMockCollection('resources');
    itemsCol.set('item-1', { id: 'item-1', priority: 10, title: 'Low Priority' });
    itemsCol.set('item-2', { id: 'item-2', priority: 50, title: 'Mid Priority' });
    itemsCol.set('item-3', { id: 'item-3', priority: 90, title: 'High Priority' });
    itemsCol.set('item-4', { id: 'item-4', priority: 30, title: 'Lower-Mid Priority' });

    // Order by priority desc: expected order [item-3 (90), item-2 (50), item-4 (30), item-1 (10)]
    // Page 1: take: 2, skip: 0 -> [item-3, item-2]
    const page1 = await prisma.resource.findMany({
      where: { id: { in: ['item-1', 'item-2', 'item-3', 'item-4'] } },
      orderBy: { priority: 'desc' },
      take: 2,
      skip: 0,
    });
    assert.equal(page1.length, 2);
    assert.equal(page1[0].id, 'item-3');
    assert.equal(page1[1].id, 'item-2');

    // Page 2: take: 2, skip: 2 -> [item-4, item-1]
    const page2 = await prisma.resource.findMany({
      where: { id: { in: ['item-1', 'item-2', 'item-3', 'item-4'] } },
      orderBy: { priority: 'desc' },
      take: 2,
      skip: 2,
    });
    assert.equal(page2.length, 2);
    assert.equal(page2[0].id, 'item-4');
    assert.equal(page2[1].id, 'item-1');
  });

  await t.test('17. Complex filters (AND, OR, in, contains) filter accurately without data loss', async () => {
    const resCol = getMockCollection('resources');
    resCol.set('r-c1', { id: 'r-c1', status: 'ACTIVE', type: 'NOTES', subject: 'Linear Algebra', downloads: 15 });
    resCol.set('r-c2', { id: 'r-c2', status: 'ACTIVE', type: 'SYLLABUS', subject: 'Calculus III', downloads: 5 });
    resCol.set('r-c3', { id: 'r-c3', status: 'ARCHIVED', type: 'NOTES', subject: 'Linear Algebra', downloads: 20 });
    resCol.set('r-c4', { id: 'r-c4', status: 'ACTIVE', type: 'NOTES', subject: 'Organic Chemistry', downloads: 2 });

    const results = await prisma.resource.findMany({
      where: {
        status: 'ACTIVE',
        type: { in: ['NOTES', 'SYLLABUS'] },
        subject: { contains: 'Linear' },
      },
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'r-c1');
  });

  await t.test('18. count() with targeted filter uses native aggregation count', async () => {
    calls.length = 0;
    const resCol = getMockCollection('resources');
    resCol.set('r-cnt-1', { id: 'r-cnt-1', creatorId: 'user-cnt-x', status: 'ACTIVE' });
    resCol.set('r-cnt-2', { id: 'r-cnt-2', creatorId: 'user-cnt-x', status: 'ACTIVE' });
    resCol.set('r-cnt-3', { id: 'r-cnt-3', creatorId: 'user-cnt-y', status: 'ACTIVE' });

    const count = await prisma.resource.count({
      where: { creatorId: 'user-cnt-x' },
    });

    assert.equal(count, 2);
    const countCall = calls.find(c => c.op === 'count.get');
    assert.ok(countCall, 'Must execute native Firestore count.get() for targeted filter');
  });
});


