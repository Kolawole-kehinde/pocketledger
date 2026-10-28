import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const isDevelopment = process.env.NODE_ENV === 'development';

const createPrismaClient = () =>
  new PrismaClient({
    log: isDevelopment
      ? ['info', 'warn', 'error']
      : ['warn', 'error'],
  });

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}