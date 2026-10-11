import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const globalForPrisma = globalThis as typeof globalThis & {
  studyosPrisma?: PrismaClient;
};

const collectQueryTimings = process.env.NODE_ENV !== 'production' && process.env.STUDYOS_PERF_LOGS === 'true';
function createPrismaClient() {
  if (collectQueryTimings) {
    const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    client.$on('query', (event) => {
      console.info(`[db] ${event.duration}ms`);
    });
    return client;
  }
  return new PrismaClient();
}

export const prisma = globalForPrisma.studyosPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.studyosPrisma = prisma;
}
