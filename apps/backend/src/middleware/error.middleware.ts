import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Errors the application raises deliberately, with a meaningful status code and
 * a message that is safe to return to the caller.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
}

interface Mapped {
  status: number;
  body: Record<string, unknown>;
  logLevel: 'warn' | 'error';
}

function mapError(err: unknown): Mapped {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: { error: err.message, ...(err.details ? { details: err.details } : {}) },
      logLevel: err.statusCode >= 500 ? 'error' : 'warn',
    };
  }

  // Previously these surfaced as a generic 500, hiding validation problems from
  // clients. Controllers that call schema.parse() directly land here.
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Validation failed',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      logLevel: 'warn',
    };
  }

  if (err instanceof MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return {
      status,
      body: {
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? `File exceeds the ${Math.floor(config.MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`
            : `Upload rejected: ${err.code}`,
      },
      logLevel: 'warn',
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return {
        status: 409,
        body: { error: 'A record with these values already exists' },
        logLevel: 'warn',
      };
    }
    if (err.code === 'P2025') {
      return { status: 404, body: { error: 'Record not found' }, logLevel: 'warn' };
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      body: { error: 'Database unavailable' },
      logLevel: 'error',
    };
  }

  return {
    status: 500,
    body: { error: 'Internal Server Error' },
    logLevel: 'error',
  };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express identifies error handlers by arity, so `next` must stay declared.
  _next: NextFunction,
) {
  const { status, body, logLevel } = mapError(err);
  const error = err instanceof Error ? err : new Error(String(err));

  logger[logLevel]('Request failed', {
    method: req.method,
    path: req.originalUrl,
    status,
    error: error.message,
    // Stacks are noisy for expected 4xx responses.
    ...(status >= 500 ? { stack: error.stack } : {}),
  });

  if (res.headersSent) return;

  // Never leak internal messages or stacks to clients in production.
  const payload =
    status >= 500 && config.isProduction
      ? { error: 'Internal Server Error' }
      : status >= 500
        ? { ...body, message: error.message }
        : body;

  res.status(status).json(payload);
}
