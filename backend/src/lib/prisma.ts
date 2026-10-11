import { randomUUID } from 'node:crypto';
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

// In-memory cache synced with Firestore for blazing-fast relational resolution
const cache = new Map<string, Map<string, Record<string, any>>>();
const initializedCollections = new Set<string>();

function getCollectionMap(name: string): Map<string, Record<string, any>> {
  let map = cache.get(name);
  if (!map) {
    map = new Map();
    cache.set(name, map);
  }
  return map;
}

async function syncCollection(name: string): Promise<Map<string, Record<string, any>>> {
  const map = getCollectionMap(name);
  if (initializedCollections.has(name)) return map;

  try {
    const db = getFirebaseDb();
    const snapshot = await db.collection(name).get();
    for (const doc of snapshot.docs) {
      map.set(doc.id, { id: doc.id, ...doc.data() });
    }
    initializedCollections.add(name);
  } catch (error) {
    // If Firebase Firestore isn't connected or offline, continue with in-memory map
    console.warn(`[firestore] Collection sync skipped for ${name}:`, (error as Error).message);
    initializedCollections.add(name);
  }
  return map;
}

async function persistDoc(name: string, id: string, data: Record<string, any>): Promise<void> {
  const map = getCollectionMap(name);
  map.set(id, { id, ...data });

  try {
    const db = getFirebaseDb();
    // Sanitize undefined fields for Firestore
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) sanitized[k] = v;
    }
    await db.collection(name).doc(id).set(sanitized, { merge: true });
  } catch (error) {
    console.warn(`[firestore] Failed to persist doc ${id} in ${name}:`, (error as Error).message);
  }
}

async function deleteDoc(name: string, id: string): Promise<void> {
  const map = getCollectionMap(name);
  map.delete(id);

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

    const val = item[key];

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
        const list = Array.isArray(val) ? val : [];
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

  private async getItems(): Promise<T[]> {
    const map = await syncCollection(this.collectionName);
    return Array.from(map.values()) as T[];
  }

  async findMany(args?: {
    where?: any;
    select?: any;
    include?: any;
    orderBy?: any;
    skip?: number;
    take?: number;
  }): Promise<any[]> {
    let items = await this.getItems();

    if (args?.where) {
      items = items.filter((item) => matchesWhere(item, args.where));
    }

    if (args?.orderBy) {
      const order = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy;
      if (order && typeof order === 'object') {
        const [field, direction] = Object.entries(order)[0] || [];
        if (field) {
          const isAsc = String(direction).toLowerCase() === 'asc';
          items = [...items].sort((a, b) => {
            const va = a[field];
            const vb = b[field];
            if (va === vb) return 0;
            if (va == null) return isAsc ? -1 : 1;
            if (vb == null) return isAsc ? 1 : -1;
            return isAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
          });
        }
      }
    }

    if (args?.skip || args?.take) {
      const start = args.skip || 0;
      const end = args.take ? start + args.take : undefined;
      items = items.slice(start, end);
    }

    const resolved = await Promise.all(items.map((item) => this.resolveRelations(item, args?.include)));

    if (args?.select) {
      return resolved.map((item) => applySelect(item, args.select));
    }
    return resolved;
  }

  async findUnique(args: { where: any; select?: any; include?: any }): Promise<any | null> {
    return this.findFirst(args);
  }

  async findFirst(args?: { where?: any; select?: any; include?: any; orderBy?: any }): Promise<any | null> {
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
        const createdMem = await memCol.create({ data: { ...m, teamPostId: id } });
        docData.memberships.push(createdMem);
      }
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
    const items = await this.findMany({ where: args?.where });
    return items.length;
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

    if (include.profile) {
      const profile = await prisma.profile.findFirst({ where: { userId: item.id } });
      resolved.profile = profile ? applySelect(profile, include.profile.select) : null;
    }

    if (include.academicIdentity) {
      const ai = await prisma.academicIdentity.findFirst({ where: { userId: item.id } });
      resolved.academicIdentity = ai ? applySelect(ai, include.academicIdentity.select) : null;
    }

    if (include.Institution) {
      resolved.Institution = null;
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

    if (include.memberships) {
      const mems = await prisma.teamMembership.findMany({ where: { teamPostId: item.id } });
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
