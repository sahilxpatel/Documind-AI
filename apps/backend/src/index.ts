// Config first: it loads and validates the environment, and every other module
// (logger included) reads from it.
import { config } from './config/env';
import './observability/appinsights';

import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { logger } from './utils/logger';
import { prisma } from './utils/prisma';
import { closeServiceBus } from './services/servicebus.service';
import { requestLogger } from './middleware/request-logger.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { generalLimiter, aiLimiter } from './middleware/rate-limit.middleware';
import { authenticate } from './middleware/auth.middleware';
import { mountSpa } from './middleware/spa.middleware';

import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import chatRoutes from './routes/chat.routes';
import searchRoutes from './routes/search.routes';
import healthRoutes from './routes/health.routes';

const app = express();

// Azure App Service terminates TLS at its front end and forwards through a
// reverse proxy. Without this, req.ip is the proxy address, so express-rate-limit
// buckets every tenant together and emits X-Forwarded-For validation errors.
// `1` = trust exactly one proxy hop, which is what App Service provides.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and non-browser callers (health probes, curl) send no Origin.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }
      logger.warn('Blocked CORS request', { origin });
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestLogger);

// Health endpoints stay outside the rate limiter: App Service probes /health
// continuously and must never be throttled.
app.use('/', healthRoutes);

app.use('/api', generalLimiter);
app.use('/api/auth', authRoutes);

// `authenticate` runs before `aiLimiter` on purpose: the limiter keys on the
// authenticated user id, which only exists once the token has been verified.
app.use('/api/documents', authenticate, aiLimiter, documentRoutes);
app.use('/api/chat', authenticate, aiLimiter, chatRoutes);
app.use('/api/search', authenticate, aiLimiter, searchRoutes);

// Mounted after the API routes so it cannot shadow them, and before the 404
// handler so client-side routes fall back to index.html. No-op when no bundle is
// present.
mountSpa(app);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  logger.info('API listening', {
    port: config.PORT,
    env: config.NODE_ENV,
    corsOrigins: config.corsOrigins,
  });
});

// App Service sends SIGTERM before recycling an instance and waits a short grace
// period. Draining in-flight requests and closing the DB pool here prevents
// dropped responses and leaked Azure SQL connections on every deploy.
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutdown signal received, draining connections', { signal });

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  server.close(async (err) => {
    if (err) logger.error('Error closing HTTP server', { error: err.message });

    const results = await Promise.allSettled([prisma.$disconnect(), closeServiceBus()]);
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Error during shutdown cleanup', {
          error: String(result.reason),
        });
      }
    }

    clearTimeout(forceExit);
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.stack : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception, shutting down', { error: error.stack });
  void shutdown('uncaughtException');
});

export { app, server };
