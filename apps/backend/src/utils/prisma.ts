import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { logger } from './logger';

/**
 * Single client per process. Azure SQL Basic/Standard tiers have low connection
 * limits, and App Service can run several instances, so creating clients ad hoc
 * exhausts the server's connection budget.
 *
 * `globalThis` caching keeps `tsx watch` from leaking a new pool on every reload
 * during development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isProduction
      ? [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }]
      : [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }, { emit: 'event', level: 'query' }],
  });

prisma.$on('error' as never, (event: { message: string }) => {
  logger.error('Prisma error', { error: event.message });
});

prisma.$on('warn' as never, (event: { message: string }) => {
  logger.warn('Prisma warning', { message: event.message });
});

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
  prisma.$on('query' as never, (event: { query: string; duration: number }) => {
    logger.debug('Prisma query', { durationMs: event.duration, query: event.query });
  });
}
