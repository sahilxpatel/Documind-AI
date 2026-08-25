import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthRequest } from './auth.middleware';
import { logger } from '../utils/logger';

/**
 * One structured line per completed request. Correlates with Application
 * Insights by reusing the Azure request id when the platform supplies one.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId =
    (req.header('x-request-id') || req.header('x-arr-log-id') || randomUUID()).slice(0, 128);

  res.setHeader('x-request-id', requestId);
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info('request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: (req as AuthRequest).user?.id,
    });
  });

  next();
}
