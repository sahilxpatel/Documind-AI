import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';
import { AuthRequest } from './auth.middleware';
import { logger } from '../utils/logger';

/**
 * Key on the authenticated user when we know who they are, falling back to IP
 * for anonymous traffic. Behind Azure's front end a shared client IP is common
 * (corporate NAT, mobile carriers), so keying on IP alone lets one busy network
 * throttle unrelated tenants.
 *
 * ipKeyGenerator normalises IPv6 addresses into subnets. express-rate-limit v8
 * requires it in custom key generators, otherwise a single client can rotate
 * through its /64 to bypass the limit.
 */
function userOrIpKey(req: Request): string {
  const userId = (req as AuthRequest).user?.id;
  return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

function buildLimiter(opts: {
  windowMs: number;
  limit: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}) {
  const keyGenerator = opts.keyGenerator ?? userOrIpKey;

  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        key: keyGenerator(req),
        path: req.originalUrl,
        limit: opts.limit,
      });
      res.status(429).json({ error: opts.message });
    },
  });
}

/** Broad ceiling across the whole API surface. */
export const generalLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: 'Too many requests. Please try again later.',
});

/**
 * Tighter budget for endpoints that cost money on every call (Azure OpenAI
 * embeddings and completions) or do heavy I/O (PDF upload and parse).
 */
export const aiLimiter = buildLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  message: 'Too many AI requests. Please slow down.',
});

/**
 * Brute-force protection for credential endpoints. Keyed on IP plus the
 * submitted email so attacking many accounts from one host, or one account from
 * one host, both hit the limit.
 */
export const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'anonymous';
    return `auth:${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
});
