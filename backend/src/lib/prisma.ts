import { randomUUID } from 'node:crypto';
import { Filter, FieldPath } from 'firebase-admin/firestore';
import { getFirebaseDb } from './firebase';

export namespace Prisma {
  export class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = code;
    }
  }

  export const TransactionIsolationLevel = {
    Serializable: 'Serializable',
    ReadCommitted: 'ReadCommitted',
  } as const;

  export type JsonValue = any;
  export type JsonObject = Record<string, any>;
  export type InputJsonValue = any;
  export type ResourceCreateInput = Record<string, any>;
}

// In-memory cache for fast document retrieval and relation resolution
const cache = new Map<string, Map<string, Record<string, any>>>();
const docCacheTimestamps = new Map<string, Map<string, number>>();
const collectionCache = new Map<string, { docs: Record<string, any>[]; cachedAt: number }>();

const DOC_CACHE_TTL_MS = 60_000; // 60s TTL for individual doc lookups
const COLLECTION_CACHE_TTL_MS = 30_000; // 30s TTL for full-collection lookups (e.g. institutions)

function getCollectionMap(name: string): Map<string, Record<string, any>> {
  let map = cache.get(name);
  if (!map) {
    map = new Map();
    cache.set(name, map);
  }
  return map;
}

function getCachedDoc(collectionName: string, id: string): Record<string, any> | null {
  const map = cache.get(collectionName);
  if (!map) return null;
  const doc = map.get(id);
  if (!doc) return null;

  const timestamps = docCacheTimestamps.get(collectionName);
  const cachedAt = timestamps?.get(id) || 0;
  if (Date.now() - cachedAt > DOC_CACHE_TTL_MS) {
    return null;
  }
  return doc;
}

function setCachedDoc(collectionName: string, id: string, data: Record<string, any>): void {
  const map = getCollectionMap(collectionName);
  map.set(id, { id, ...data });

  let timestamps = docCacheTimestamps.get(collectionName);
  if (!timestamps) {
    timestamps = new Map();
    docCacheTimestamps.set(collectionName, timestamps);
  }
  timestamps.set(id, Date.now());
}

function invalidateDoc(collectionName: string, id: string): void {
  const map = cache.get(collectionName);
  if (map) map.delete(id);
  const timestamps = docCacheTimestamps.get(collectionName);
  if (timestamps) timestamps.delete(id);
  collectionCache.delete(collectionName);
}

function invalidateCollection(collectionName: string): void {
  collectionCache.delete(collectionName);
}

async function persistDoc(name: string, id: string, data: Record<string, any>): Promise<void> {
  setCachedDoc(name, id, data);
  invalidateCollection(name);

  try {
    const db = getFirebaseDb();
    // Sanitize undefined fields for Firestore
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) sanitized[k] = v;
    }
    await db.collection(name).doc(id).set(sanitized, { merge: true });
  } catch (error) {
    console.error(`[CRITICAL FIRESTORE ERROR] Failed to persist doc ${id} in ${name}:`, (error as Error).message);
  }
}

async function deleteDoc(name: string, id: string): Promise<void> {
  invalidateDoc(name, id);

  try {
    const db = getFirebaseDb();
    await db.collection(name).doc(id).delete();
  } catch (error) {
    console.warn(`[firestore] Failed to delete doc ${id} in ${name}:`, (error as Error).message);
  }
}

function matchesWhere(item: Record<string, any>, where: any): boolean {
  if (!where || typeof where !== 'object') return true;

  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') {
      if (Array.isArray(condition)) {
        if (!condition.some((sub) => matchesWhere(item, sub))) return false;
      }
      continue;
    }

    if (key === 'AND') {
      if (Array.isArray(condition)) {
        if (!condition.every((sub) => matchesWhere(item, sub))) return false;
      }
      continue;
    }

    if (key === 'NOT') {
      if (condition && matchesWhere(item, condition)) return false;
      continue;
    }

    // Handle composite unique keys like userId_resourceId, userId_sectionId_isActive, etc.
    if (
      key.includes('_') &&
      condition &&
      typeof condition === 'object' &&
      !Array.isArray(condition) &&
      !(condition instanceof Date) &&
      !('equals' in condition || 'in' in condition || 'not' in condition || 'contains' in condition || 'gt' in condition || 'gte' in condition || 'lt' in condition || 'lte' in condition || 'some' in condition || 'is' in condition || 'isNot' in condition)
    ) {
      if (!matchesWhere(item, condition)) return false;
      continue;
    }

    // Synonym handling for teamId and teamPostId
    let val = item[key];
    if (val === undefined) {
      if (key === 'teamId') val = item['teamPostId'];
      else if (key === 'teamPostId') val = item['teamId'];
    }

    if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
      const cond = condition as Record<string, any>;
      if ('equals' in cond && val !== cond.equals) return false;
      if ('not' in cond && val === cond.not) return false;

      if ('contains' in cond) {
        const strVal = String(val ?? '');
        const search = String(cond.contains ?? '');
        if (cond.mode === 'insensitive') {
          if (!strVal.toLowerCase().includes(search.toLowerCase())) return false;
        } else {
          if (!strVal.includes(search)) return false;
        }
      }

      if ('in' in cond && Array.isArray(cond.in) && !cond.in.includes(val)) return false;
      if ('notIn' in cond && Array.isArray(cond.notIn) && cond.notIn.includes(val)) return false;

      if ('gt' in cond && !(val > cond.gt)) return false;
      if ('gte' in cond && !(val >= cond.gte)) return false;
      if ('lt' in cond && !(val < cond.lt)) return false;
      if ('lte' in cond && !(val <= cond.lte)) return false;

      if ('some' in cond) {
        let list = Array.isArray(val) ? val : [];
        if (list.length === 0 && item.id) {
          // Check cached collections if relational array not directly present on doc
          if (key === 'members') {
            const memberMap = cache.get('conversation_members');
            if (memberMap) {
              list = Array.from(memberMap.values()).filter((m) => m.conversationId === item.id);
            }
          } else if (key === 'saves') {
            const saveMap = cache.get('resource_saves');
            if (saveMap) {
              list = Array.from(saveMap.values()).filter((s) => s.resourceId === item.id);
            }
          } else if (key === 'memberships') {
            const memMap = cache.get('team_memberships');
            if (memMap) {
              list = Array.from(memMap.values()).filter((m) => m.teamId === item.id || m.teamPostId === item.id);
            }
          }
        }
        if (!list.some((elem) => matchesWhere(elem, cond.some))) return false;
      }

      if ('is' in cond) {
        if (!val || !matchesWhere(val, cond.is)) return false;
      }

      if ('isNot' in cond) {
        if (cond.isNot === null && (val === null || val === undefined)) return false;
        if (cond.isNot !== null && val && matchesWhere(val, cond.isNot)) return false;
      }

      continue;
    }

    if (val !== condition) return false;
  }

  return true;
}

function applySelect(item: Record<string, any>, select: Record<string, any> | undefined): Record<string, any> {
  if (!select) return { ...item };
  const out: Record<string, any> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      if (typeof enabled === 'object' && item[key] && typeof item[key] === 'object') {
        out[key] = Array.isArray(item[key])
          ? item[key].map((x: any) => applySelect(x, enabled.select || enabled))
          : applySelect(item[key], enabled.select || enabled);
      } else {
        out[key] = item[key];
      }
    }
  }
  return out;
}

export class FirestoreCollection<T extends Record<string, any> = Record<string, any>> {
  constructor(public readonly collectionName: string) {}

  private buildFirestoreQuery(
    db: any,
    where?: any,
    take?: number,
    skip?: number,
    orderBy?: any,
  ): { query: any; canLimitAtDb: boolean; canCountAtDb: boolean } {
    let query: any = db.collection(this.collectionName);
    if (!where || typeof where !== 'object' || Object.keys(where).length === 0) {
      const canLimitAtDb = typeof take === 'number' && take > 0;
      if (orderBy) {
        const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        if (order && typeof order === 'object') {
          const [field, direction] = Object.entries(order)[0] || [];
          if (field && typeof field === 'string') {
            const dir = String(direction).toLowerCase() === 'desc' ? 'desc' : 'asc';
            query = query.orderBy(field, dir);
          }
        }
      }
      if (canLimitAtDb) {
        query = query.limit(take + (skip || 0));
      }
      return { query, canLimitAtDb, canCountAtDb: true };
    }

    let hasInMemoryOnly = false;
    let appliedCount = 0;

    for (const [key, condition] of Object.entries(where)) {
      if (key === 'OR') {
        if (Array.isArray(condition) && condition.length > 0 && condition.length <= 10) {
          const orFilters: any[] = [];
          let canConvertOr = true;

          for (const branch of condition) {
            if (!branch || typeof branch !== 'object') {
              canConvertOr = false;
              break;
            }
            const entries = Object.entries(branch);
            if (entries.length === 1) {
              const [bKey, bVal] = entries[0];
              if (typeof bVal === 'string' || typeof bVal === 'number' || typeof bVal === 'boolean') {
                orFilters.push(Filter.where(bKey, '==', bVal));
              } else {
                canConvertOr = false;
                break;
              }
            } else {
              canConvertOr = false;
              break;
            }
          }

          if (canConvertOr && orFilters.length > 0) {
            query = query.where(Filter.or(...orFilters));
            appliedCount++;
          } else {
            hasInMemoryOnly = true;
          }
        } else {
          hasInMemoryOnly = true;
        }
        continue;
      }

      if (key === 'AND') {
        if (Array.isArray(condition)) {
          for (const sub of condition) {
            if (sub && typeof sub === 'object') {
              for (const [subKey, subVal] of Object.entries(sub)) {
                if (typeof subVal === 'string' || typeof subVal === 'number' || typeof subVal === 'boolean') {
                  query = query.where(subKey, '==', subVal);
                  appliedCount++;
                } else {
                  hasInMemoryOnly = true;
                }
              }
            }
          }
        }
        continue;
      }

      if (key === 'NOT') {
        hasInMemoryOnly = true;
        continue;
      }

      // Handle composite unique keys like userId_resourceId
      if (
        key.includes('_') &&
        condition &&
        typeof condition === 'object' &&
        !Array.isArray(condition) &&
        !(condition instanceof Date) &&
        !('equals' in condition || 'in' in condition || 'not' in condition || 'contains' in condition || 'gt' in condition || 'gte' in condition || 'lt' in condition || 'lte' in condition || 'some' in condition || 'is' in condition || 'isNot' in condition)
      ) {
        for (const [subKey, subVal] of Object.entries(condition)) {
          if (typeof subVal === 'string' || typeof subVal === 'number' || typeof subVal === 'boolean') {
            query = query.where(subKey, '==', subVal);
            appliedCount++;
          } else {
            hasInMemoryOnly = true;
          }
        }
        continue;
      }

      // Handle direct primitive equality
      if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
        if (key === 'teamId' || key === 'teamPostId') {
          query = query.where(Filter.or(Filter.where('teamId', '==', condition), Filter.where('teamPostId', '==', condition)));
        } else {
          query = query.where(key, '==', condition);
        }
        appliedCount++;
        continue;
      }

      if (condition === null) {
        query = query.where(key, '==', null);
        appliedCount++;
        continue;
      }

      // Handle operator objects
      if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
        const cond = condition as Record<string, any>;
        if ('equals' in cond && (typeof cond.equals === 'string' || typeof cond.equals === 'number' || typeof cond.equals === 'boolean' || cond.equals === null)) {
          query = query.where(key, '==', cond.equals);
          appliedCount++;
        } else if ('in' in cond && Array.isArray(cond.in)) {
          if (cond.in.length > 0 && cond.in.length <= 30 && cond.in.every((x: any) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
            query = query.where(key, 'in', cond.in);
            appliedCount++;
          } else {
            hasInMemoryOnly = true;
          }
        } else {
          hasInMemoryOnly = true;
        }
        continue;
      }

      hasInMemoryOnly = true;
    }

    const hasFilters = appliedCount > 0;
    const hasOrderBy = !!orderBy;

    // We can only push .limit() to Firestore if there are no in-memory-only filters,
    // AND if there is no orderBy (or if there are no filters so Firestore single-field index orders it).
    // If there ARE filters AND orderBy, pushing .limit() to Firestore without ordering causes Firestore
    // to discard matching records before sorting in memory.
    const canLimitAtDb = !hasInMemoryOnly && (!hasOrderBy || !hasFilters) && typeof take === 'number' && take > 0;
    if (canLimitAtDb) {
      query = query.limit(take + (skip || 0));
    }

    const canCountAtDb = !hasInMemoryOnly;
    return { query, canLimitAtDb, canCountAtDb };
  }

  async findMany(args?: {
    where?: any;
    select?: any;
    include?: any;
    orderBy?: any;
    skip?: number;
    take?: number;
  }): Promise<any[]> {
    const db = getFirebaseDb();

    // Fast path: direct document lookup if where contains a single string id
    if (typeof args?.where?.id === 'string' && Object.keys(args.where).length === 1) {
      const id = args.where.id;
      let item: Record<string, any> | null = getCachedDoc(this.collectionName, id);
      if (!item) {
        try {
          const docSnap = await db.collection(this.collectionName).doc(id).get();
          if (docSnap.exists) {
            item = { id: docSnap.id, ...docSnap.data() };
            setCachedDoc(this.collectionName, id, item);
          }
        } catch (err: any) {
          console.warn(`[prisma] findMany direct doc lookup failed for ${this.collectionName}/${id}:`, err?.message);
        }
      }

      if (!item) return [];

      const resolved = await Promise.all([this.resolveRelations(item, args?.include)]);
      return args?.select ? resolved.map((x) => applySelect(x, args.select)) : resolved;
    }

    let items: Record<string, any>[] = [];

    // Collection cache check for unfiltered queries without take
    const isUnfiltered = !args?.where || Object.keys(args.where).length === 0;
    if (isUnfiltered && !args?.take) {
      const cached = collectionCache.get(this.collectionName);
      if (cached && Date.now() - cached.cachedAt < COLLECTION_CACHE_TTL_MS) {
        items = [...cached.docs];
      }
    }

    if (items.length === 0) {
      const { query } = this.buildFirestoreQuery(db, args?.where, args?.take, args?.skip, args?.orderBy);
      let snapshot: any;

      try {
        snapshot = await query.get();
      } catch (err: any) {
        const isIndexError =
          (err as any)?.code === 9 ||
          String(err?.message || '').includes('FAILED_PRECONDITION') ||
          String(err?.message || '').includes('requires an index');

        if (isUnfiltered && !args?.orderBy) {
          // Safe fallback: when no specific ordering is requested, taking a slice from base collection is semantically valid.
          console.warn(`[prisma] Unfiltered query without orderBy failed for ${this.collectionName} (${err?.message}). Retrying base collection.`);
          try {
            let fallbackQuery: any = db.collection(this.collectionName);
            if (typeof args?.take === 'number' && args.take > 0) {
              fallbackQuery = fallbackQuery.limit(args.take + (args.skip || 0));
            }
            snapshot = await fallbackQuery.get();
          } catch (fallbackErr: any) {
            console.error(`[prisma] Fallback query failed for ${this.collectionName}:`, fallbackErr?.message);
            throw new Prisma.PrismaClientKnownRequestError(
              `Query failed for ${this.collectionName}: ${fallbackErr?.message}`,
              { code: 'P2010' }
            );
          }
        } else {
          // When filters or orderBy are specified, falling back to an unordered or arbitrary slice would silently return incomplete or incorrectly ordered results.
          // Furthermore, scanning the entire collection would recreate unbounded reads.
          // Safely propagate a Prisma-compatible error so missing indexes can be added.
          console.error(`[prisma] Query failed for ${this.collectionName}:`, (err as Error).message);
          throw new Prisma.PrismaClientKnownRequestError(
            `Query failed for ${this.collectionName}: ${(err as Error).message}`,
            { code: isIndexError ? 'P2021' : 'P2010' }
          );
        }
      }

      items = snapshot.docs.map((doc: any) => {
        const data = { id: doc.id, ...doc.data() };
        setCachedDoc(this.collectionName, doc.id, data);
        return data;
      });

      if (isUnfiltered && !args?.take) {
        collectionCache.set(this.collectionName, { docs: items, cachedAt: Date.now() });
      }
    }

    // Filter with matchesWhere
    if (args?.where) {
      items = items.filter((item) => matchesWhere(item, args.where));
    }

    // In-memory sorting (preserves exact Prisma sorting behavior, supports multi-key sorting and stable ID tie-breaker)
    if (args?.orderBy) {
      const orderList: Array<{ field: string; isAsc: boolean }> = [];
      const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
      for (const order of orders) {
        if (order && typeof order === 'object') {
          for (const [field, direction] of Object.entries(order)) {
            if (field && typeof field === 'string') {
              orderList.push({
                field,
                isAsc: String(direction).toLowerCase() === 'asc',
              });
            }
          }
        }
      }

      if (orderList.length > 0) {
        items = [...items].sort((a, b) => {
          for (const { field, isAsc } of orderList) {
            const va = a[field];
            const vb = b[field];
            if (va === vb) continue;
            if (va == null) return isAsc ? -1 : 1;
            if (vb == null) return isAsc ? 1 : -1;
            if (va > vb) return isAsc ? 1 : -1;
            if (va < vb) return isAsc ? -1 : 1;
          }
          // Stable tie-breaker by id if present
          if (a.id && b.id && a.id !== b.id) {
            return a.id > b.id ? 1 : -1;
          }
          return 0;
        });
      }
    }

    // In-memory pagination
    if (args?.skip || args?.take) {
      const start = args.skip || 0;
      const end = args.take ? start + args.take : undefined;
      items = items.slice(start, end);
    }

    // Relational resolution only on final sliced items
    const resolved = await Promise.all(items.map((item) => this.resolveRelations(item, args?.include)));

    if (args?.select) {
      return resolved.map((item) => applySelect(item, args.select));
    }
    return resolved;
  }

  async findUnique(args: { where: any; select?: any; include?: any }): Promise<any | null> {
    if (!args?.where) return null;

    // Fast path: direct document lookup by id
    if (typeof args.where.id === 'string') {
      const id = args.where.id;
      let item: Record<string, any> | null = getCachedDoc(this.collectionName, id);

      if (!item) {
        try {
          const db = getFirebaseDb();
          const docSnap = await db.collection(this.collectionName).doc(id).get();
          if (!docSnap.exists) {
            return null;
          }
          item = { id: docSnap.id, ...docSnap.data() };
          setCachedDoc(this.collectionName, id, item);
        } catch (err: any) {
          console.error(`[prisma] findUnique doc fetch failed for ${this.collectionName}/${id}:`, err?.message);
          return null;
        }
      }

      if (!matchesWhere(item, args.where)) {
        return null;
      }

      const resolved = await this.resolveRelations(item, args.include);
      return args.select ? applySelect(resolved, args.select) : resolved;
    }

    return this.findFirst(args);
  }

  async findFirst(args?: { where?: any; select?: any; include?: any; orderBy?: any }): Promise<any | null> {
    if (typeof args?.where?.id === 'string' && !args?.orderBy && !args?.where?.OR && !args?.where?.AND) {
      return this.findUnique(args as any);
    }

    const results = await this.findMany({ ...args, take: 1 });
    return results[0] || null;
  }

  async create(args: { data: any; select?: any; include?: any }): Promise<any> {
    const now = new Date().toISOString();
    const id = args.data.id || randomUUID();
    const docData: Record<string, any> = {
      ...args.data,
      id,
      createdAt: args.data.createdAt || now,
      updatedAt: now,
    };

    // Handle nested creates
    if (args.data.files?.create) {
      const filesCol = new FirestoreCollection('resource_files');
      const files = Array.isArray(args.data.files.create) ? args.data.files.create : [args.data.files.create];
      docData.files = [];
      for (const file of files) {
        const createdFile = await filesCol.create({ data: { ...file, resourceId: id } });
        docData.files.push(createdFile);
      }
    }

    if (args.data.tags?.create) {
      const tagsCol = new FirestoreCollection('resource_tags');
      const tags = Array.isArray(args.data.tags.create) ? args.data.tags.create : [args.data.tags.create];
      docData.tags = [];
      for (const t of tags) {
        const createdTag = await tagsCol.create({ data: { ...t, resourceId: id } });
        docData.tags.push(createdTag);
      }
    }

    if (args.data.memberships?.create) {
      const memCol = new FirestoreCollection('team_memberships');
      const mems = Array.isArray(args.data.memberships.create) ? args.data.memberships.create : [args.data.memberships.create];
      docData.memberships = [];
      for (const m of mems) {
        const userId = m.userId || m.user?.connect?.id || m.user?.id;
        const createdMem = await memCol.create({ data: { ...m, userId, teamPostId: id, teamId: id } });
        docData.memberships.push(createdMem);
      }
    }

    if (this.collectionName === 'team_memberships') {
      if (docData.teamId && !docData.teamPostId) docData.teamPostId = docData.teamId;
      if (docData.teamPostId && !docData.teamId) docData.teamId = docData.teamPostId;
    }

    if (args.data.members?.create) {
      const memCol = new FirestoreCollection('conversation_members');
      const mems = Array.isArray(args.data.members.create) ? args.data.members.create : [args.data.members.create];
      docData.members = [];
      for (const m of mems) {
        const createdMem = await memCol.create({ data: { ...m, conversationId: id } });
        docData.members.push(createdMem);
      }
    }

    await persistDoc(this.collectionName, id, docData);
    const resolved = await this.resolveRelations(docData, args.include);
    return args.select ? applySelect(resolved, args.select) : resolved;
  }

  async createMany(args: { data: any[]; skipDuplicates?: boolean }): Promise<{ count: number }> {
    const list = Array.isArray(args.data) ? args.data : [args.data];
    let count = 0;
    for (const item of list) {
      try {
        await this.create({ data: item });
        count++;
      } catch (e) {
        if (!args.skipDuplicates) throw e;
      }
    }
    return { count };
  }

  async update(args: { where: any; data: any; select?: any; include?: any }): Promise<any> {
    const existing = await this.findFirst({ where: args.where });
    if (!existing) {
      throw new Prisma.PrismaClientKnownRequestError('Record to update not found', { code: 'P2025' });
    }

    const updatedData = {
      ...existing,
      ...args.data,
      updatedAt: new Date().toISOString(),
    };

    await persistDoc(this.collectionName, existing.id, updatedData);
    const resolved = await this.resolveRelations(updatedData, args.include);
    return args.select ? applySelect(resolved, args.select) : resolved;
  }

  async updateMany(args: { where: any; data: any }): Promise<{ count: number }> {
    const matching = await this.findMany({ where: args.where });
    for (const item of matching) {
      await this.update({ where: { id: item.id }, data: args.data });
    }
    return { count: matching.length };
  }

  async upsert(args: { where: any; update: any; create: any; select?: any; include?: any }): Promise<any> {
    const existing = await this.findFirst({ where: args.where });
    if (existing) {
      return this.update({ where: { id: existing.id }, data: args.update, select: args.select, include: args.include });
    }
    return this.create({ data: args.create, select: args.select, include: args.include });
  }

  async delete(args: { where: any }): Promise<any> {
    const existing = await this.findFirst({ where: args.where });
    if (!existing) {
      throw new Prisma.PrismaClientKnownRequestError('Record to delete not found', { code: 'P2025' });
    }
    await deleteDoc(this.collectionName, existing.id);
    return existing;
  }

  async deleteMany(args: { where?: any }): Promise<{ count: number }> {
    const matching = await this.findMany({ where: args?.where });
    for (const item of matching) {
      await deleteDoc(this.collectionName, item.id);
    }
    return { count: matching.length };
  }

  async count(args?: { where?: any }): Promise<number> {
    const isUnfiltered = !args?.where || Object.keys(args.where).length === 0;

    try {
      const db = getFirebaseDb();
      if (isUnfiltered) {
        const countSnap = await db.collection(this.collectionName).count().get();
        return countSnap.data().count;
      }

      const { query, canCountAtDb } = this.buildFirestoreQuery(db, args?.where);
      if (canCountAtDb) {
        const countSnap = await query.count().get();
        return countSnap.data().count;
      }
    } catch (err: any) {
      // Fallback on count error
    }

    const items = await this.findMany({ where: args?.where });
    return items.length;
  }

  async aggregate(args?: {
    where?: any;
    _avg?: Record<string, boolean>;
    _count?: Record<string, boolean> | boolean;
    _sum?: Record<string, boolean>;
    _min?: Record<string, boolean>;
    _max?: Record<string, boolean>;
  }): Promise<any> {
    const items = await this.findMany({ where: args?.where });
    const count = items.length;
    const result: any = {};

    if (args?._count) {
      if (typeof args._count === 'boolean') {
        result._count = count;
      } else {
        const counts: Record<string, number> = {};
        for (const field of Object.keys(args._count)) {
          counts[field] = items.filter((x) => x[field] !== undefined && x[field] !== null).length;
        }
        result._count = counts;
      }
    }

    if (args?._avg) {
      const avgs: Record<string, number | null> = {};
      for (const field of Object.keys(args._avg)) {
        if (count === 0) {
          avgs[field] = null;
        } else {
          const sum = items.reduce((acc, x) => acc + (Number(x[field]) || 0), 0);
          avgs[field] = sum / count;
        }
      }
      result._avg = avgs;
    }

    if (args?._sum) {
      const sums: Record<string, number | null> = {};
      for (const field of Object.keys(args._sum)) {
        sums[field] = items.reduce((acc, x) => acc + (Number(x[field]) || 0), 0);
      }
      result._sum = sums;
    }

    if (args?._min) {
      const mins: Record<string, any> = {};
      for (const field of Object.keys(args._min)) {
        mins[field] = items.reduce((min, x) => (min === null || x[field] < min ? x[field] : min), null);
      }
      result._min = mins;
    }

    if (args?._max) {
      const maxs: Record<string, any> = {};
      for (const field of Object.keys(args._max)) {
        maxs[field] = items.reduce((max, x) => (max === null || x[field] > max ? x[field] : max), null);
      }
      result._max = maxs;
    }

    return result;
  }

  async groupBy(args: { by: string[]; where?: any; _avg?: any; _count?: any }): Promise<any[]> {
    const items = await this.findMany({ where: args.where });
    const groups = new Map<string, any[]>();
    for (const item of items) {
      const key = args.by.map((f) => String(item[f] ?? '')).join('::');
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push(item);
    }

    const result: any[] = [];
    for (const list of groups.values()) {
      const first = list[0];
      const groupResult: any = {};
      for (const b of args.by) {
        groupResult[b] = first[b];
      }
      if (args._count) {
        groupResult._count = { rating: list.length };
      }
      if (args._avg) {
        const sum = list.reduce((acc, x) => acc + (Number(x.rating) || 0), 0);
        groupResult._avg = { rating: list.length ? sum / list.length : 0 };
      }
      result.push(groupResult);
    }
    return result;
  }

  private async resolveRelations(item: Record<string, any>, include?: Record<string, any>): Promise<Record<string, any>> {
    if (!include || typeof include !== 'object') return item;
    const resolved = { ...item };

    if (include.creator) {
      const creatorId = item.creatorId || item.userId;
      if (creatorId) {
        const user = await prisma.user.findUnique({ where: { id: creatorId } });
        resolved.creator = user ? applySelect(user, include.creator.select) : null;
      } else {
        resolved.creator = null;
      }
    }

    if (include.provider) {
      const providerId = item.providerId;
      if (providerId) {
        const user = await prisma.user.findUnique({ where: { id: providerId } });
        resolved.provider = user ? applySelect(user, include.provider.select) : null;
      } else {
        resolved.provider = null;
      }
    }

    if (include.uploader) {
      const uploaderId = item.uploaderId;
      if (uploaderId) {
        const user = await prisma.user.findUnique({ where: { id: uploaderId } });
        resolved.uploader = user ? applySelect(user, include.uploader.select) : null;
      } else {
        resolved.uploader = null;
      }
    }

    if (include.user) {
      const userId = item.userId || item.senderId || item.authorId || item.id;
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        resolved.user = user ? applySelect(user, include.user.select || include.user) : null;
      } else {
        resolved.user = null;
      }
    }

    if (include.author) {
      const authorId = item.authorId || item.userId;
      if (authorId) {
        const user = await prisma.user.findUnique({ where: { id: authorId } });
        resolved.author = user ? applySelect(user, include.author.select || include.author) : null;
      } else {
        resolved.author = null;
      }
    }

    if (include.sender) {
      const senderId = item.senderId;
      if (senderId) {
        const user = await prisma.user.findUnique({ where: { id: senderId } });
        resolved.sender = user ? applySelect(user, include.sender.select || include.sender) : null;
      } else {
        resolved.sender = null;
      }
    }

    if (include.profile) {
      const profile = await prisma.profile.findFirst({ where: { userId: item.id } });
      resolved.profile = profile ? applySelect(profile, include.profile.select) : null;
    }

    if (include.academicIdentity) {
      const ai = await prisma.academicIdentity.findFirst({ where: { userId: item.id } });
      resolved.academicIdentity = ai ? applySelect(ai, include.academicIdentity.select) : null;
    }

    if (include.Institution) {
      if (item.institutionId) {
        resolved.Institution = await prisma.institution.findUnique({ where: { id: item.institutionId } });
      } else {
        const ai = resolved.academicIdentity || (await prisma.academicIdentity.findFirst({ where: { userId: item.id } }));
        const instName = ai?.institution || item.profile?.institution;
        if (instName) {
          const allInst = await prisma.institution.findMany({});
          const matched = allInst.find(
            (inst: any) =>
              inst.name?.toLowerCase() === String(instName).toLowerCase() ||
              inst.code?.toLowerCase() === String(instName).toLowerCase() ||
              `${inst.name} (${inst.code})`.toLowerCase() === String(instName).toLowerCase()
          );
          resolved.Institution = matched || null;
        } else {
          resolved.Institution = null;
        }
      }
    }

    if (include.files) {
      const filesCol = item.projectId ? prisma.projectFile : prisma.resourceFile;
      const foreignKey = item.projectId ? 'projectId' : 'resourceId';
      const files = await filesCol.findMany({ where: { [foreignKey]: item.id } });
      resolved.files = files.map((f: any) => applySelect(f, include.files.select));
    }

    if (include.tags) {
      const tagsCol = item.projectId ? prisma.projectTag : prisma.resourceTag;
      const foreignKey = item.projectId ? 'projectId' : 'resourceId';
      const tags = await tagsCol.findMany({ where: { [foreignKey]: item.id } });
      resolved.tags = tags.map((t: any) => applySelect(t, include.tags.select));
    }

    if (include.saves) {
      const saves = await prisma.resourceSave.findMany({ where: { resourceId: item.id, ...include.saves.where } });
      resolved.saves = saves.map((s: any) => applySelect(s, include.saves.select));
    }

    if (include.ratings) {
      const ratings = await prisma.resourceRating.findMany({ where: { resourceId: item.id } });
      resolved.ratings = ratings;
    }

    if (include.comments) {
      const comments = await prisma.resourceComment.findMany({
        where: { resourceId: item.id },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      });
      resolved.comments = comments;
    }

    if (include.memberships) {
      const mems = await prisma.teamMembership.findMany({
        where: { OR: [{ teamPostId: item.id }, { teamId: item.id }] },
        include: include.memberships.include,
      });
      resolved.memberships = mems.map((m: any) => applySelect(m, include.memberships.select));
    }

    if (include.skills) {
      const sSkills = await prisma.studentSkill.findMany({ where: { userId: item.id }, include: include.skills.select?.skill ? { skill: true } : undefined });
      resolved.skills = sSkills;
    }

    if (include.skill) {
      if (item.skillId) {
        const skill = await prisma.skill.findUnique({ where: { id: item.skillId } });
        resolved.skill = skill ? applySelect(skill, include.skill.select) : null;
      }
    }

    if (include.members) {
      const members = await prisma.conversationMember.findMany({ where: { conversationId: item.id }, include: include.members.include });
      resolved.members = members;
    }

    if (include.messages) {
      const messages = await prisma.message.findMany({ where: { conversationId: item.id }, orderBy: { createdAt: 'asc' } });
      resolved.messages = messages;
    }

    if (include.topics) {
      const topics = await prisma.virtualStudyTopic.findMany({ where: { classId: item.id }, orderBy: { order: 'asc' } });
      resolved.topics = topics;
    }

    if (include.resource) {
      const resourceId = item.resourceId;
      if (resourceId) {
        const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
        resolved.resource = resource ? applySelect(resource, include.resource.select) : null;
      } else {
        resolved.resource = null;
      }
    }

    if (include.service) {
      const serviceId = item.serviceId;
      if (serviceId) {
        const service = await prisma.helpService.findUnique({ where: { id: serviceId } });
        resolved.service = service ? applySelect(service, include.service.select) : null;
      } else {
        resolved.service = null;
      }
    }

    if (include.requester) {
      const requesterId = item.requesterId || item.userId;
      if (requesterId) {
        const user = await prisma.user.findUnique({ where: { id: requesterId } });
        resolved.requester = user ? applySelect(user, include.requester.select || include.requester) : null;
      } else {
        resolved.requester = null;
      }
    }

    if (include.provider) {
      const providerId = item.providerId;
      if (providerId) {
        const user = await prisma.user.findUnique({ where: { id: providerId } });
        resolved.provider = user ? applySelect(user, include.provider.select || include.provider) : null;
      } else {
        resolved.provider = null;
      }
    }

    if (include.project) {
      const projectId = item.projectId;
      if (projectId) {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        resolved.project = project ? applySelect(project, include.project.select) : null;
      } else {
        resolved.project = null;
      }
    }

    if (include.team) {
      const teamId = item.teamId || item.teamPostId;
      if (teamId) {
        const team = await prisma.teamPost.findUnique({ where: { id: teamId } });
        resolved.team = team ? applySelect(team, include.team.select) : null;
      } else {
        resolved.team = null;
      }
    }

    if (include.requests) {
      const requests = await prisma.teamJoinRequest.findMany({
        where: { OR: [{ teamId: item.id }, { teamPostId: item.id }], ...include.requests.where },
      });
      resolved.requests = requests.map((r: any) => applySelect(r, include.requests.select));
    }

    if (include._count) {
      const countObj: Record<string, number> = {};
      if (include._count.select?.memberships) {
        countObj.memberships = await prisma.teamMembership.count({ where: { teamPostId: item.id } });
      }
      if (include._count.select?.saves) {
        countObj.saves = await prisma.resourceSave.count({ where: { resourceId: item.id } });
      }
      if (include._count.select?.ratings) {
        countObj.ratings = await prisma.resourceRating.count({ where: { resourceId: item.id } });
      }
      if (include._count.select?.reviews) {
        countObj.reviews = await prisma.serviceReview.count({ where: { serviceId: item.id } });
      }
      resolved._count = countObj;
    }

    return resolved;
  }
}

export const prisma = {
  user: new FirestoreCollection('users'),
  profile: new FirestoreCollection('profiles'),
  academicIdentity: new FirestoreCollection('academic_identities'),
  institution: new FirestoreCollection('institutions'),
  resource: new FirestoreCollection('resources'),
  resourceFile: new FirestoreCollection('resource_files'),
  resourceLink: new FirestoreCollection('resource_links'),
  resourceTag: new FirestoreCollection('resource_tags'),
  resourceSave: new FirestoreCollection('resource_saves'),
  resourceRating: new FirestoreCollection('resource_ratings'),
  resourceReport: new FirestoreCollection('resource_reports'),
  resourceComment: new FirestoreCollection('resource_comments'),
  virtualStudyClass: new FirestoreCollection('classes'),
  virtualStudyTopic: new FirestoreCollection('class_topics'),
  virtualStudyResource: new FirestoreCollection('class_resources'),
  project: new FirestoreCollection('projects'),
  projectFile: new FirestoreCollection('project_files'),
  projectTag: new FirestoreCollection('project_tags'),
  labRecord: new FirestoreCollection('labs'),
  teamPost: new FirestoreCollection('teams'),
  teamMembership: new FirestoreCollection('team_memberships'),
  teamJoinRequest: new FirestoreCollection('team_join_requests'),
  skill: new FirestoreCollection('skills'),
  studentSkill: new FirestoreCollection('student_skills'),
  helpService: new FirestoreCollection('help_services'),
  helpRequest: new FirestoreCollection('help_requests'),
  serviceReview: new FirestoreCollection('service_reviews'),
  notification: new FirestoreCollection('notifications'),
  conversation: new FirestoreCollection('conversations'),
  conversationMember: new FirestoreCollection('conversation_members'),
  message: new FirestoreCollection('messages'),
  timetable: new FirestoreCollection('timetable'),
  attendance: new FirestoreCollection('attendance'),
  attendanceRecord: new FirestoreCollection('attendance_records'),
  attendanceRegister: new FirestoreCollection('attendance_registers'),
  holiday: new FirestoreCollection('holidays'),
  section: new FirestoreCollection('sections'),
  subject: new FirestoreCollection('subjects'),

  async $transaction<T>(fn: ((tx: any) => Promise<T>) | any[], _options?: any): Promise<T> {
    if (typeof fn === 'function') {
      return await fn(prisma);
    }
    return (await Promise.all(fn)) as any;
  },

  async $disconnect(): Promise<void> {
    // No-op for Firebase Firestore
  },
};
