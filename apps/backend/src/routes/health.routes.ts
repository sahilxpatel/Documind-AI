import { Router } from 'express';
import { config } from '../config/env';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

const router = Router();

const startedAt = Date.now();
const revision = process.env.GITHUB_SHA || process.env.WEBSITE_DEPLOYMENT_ID || 'local';

/**
 * Liveness. Deliberately dependency-free: this is what App Service polls, and
 * failing it causes Azure to recycle the instance. A database outage should not
 * trigger an endless instance-replacement loop, so dependency checks live on
 * /health/ready instead.
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'documind-api',
    env: config.NODE_ENV,
    revision,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  });
});

/**
 * Readiness. Verifies the app can actually serve traffic. Used as the
 * post-deployment smoke test in CI and by any external monitor that should page
 * on a broken dependency.
 */
router.get('/health/ready', async (_req, res) => {
  const checks: Record<string, { status: 'up' | 'down'; detail?: string }> = {};

  const timeoutMs = config.DB_HEALTHCHECK_TIMEOUT_MS;
  let timer: NodeJS.Timeout | undefined;

  try {
    // Cheap round trip that still proves credentials, network path and firewall
    // rules to Azure SQL are all working.
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`database check timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    checks.database = { status: 'up' };
  } catch (error) {
    checks.database = { status: 'down', detail: (error as Error).message };
    logger.error('Readiness check failed', { error: (error as Error).message });
  } finally {
    // Without this the pending timer keeps the event loop busy for the full
    // window on every successful probe.
    if (timer) clearTimeout(timer);
  }

  // Reported, not gated: the API still serves reads if AI config is incomplete.
  checks.search = {
    status: config.AZURE_SEARCH_ENDPOINT && config.AZURE_SEARCH_KEY ? 'up' : 'down',
  };
  checks.openai = {
    status: config.AZURE_OPENAI_ENDPOINT && config.AZURE_OPENAI_KEY ? 'up' : 'down',
  };
  checks.storage = {
    status: config.AZURE_STORAGE_CONNECTION_STRING ? 'up' : 'down',
  };
  checks.serviceBus = {
    status: config.AZURE_SERVICE_BUS_CONNECTION_STRING ? 'up' : 'down',
  };

  const ready = checks.database.status === 'up';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not-ready',
    revision,
    checks,
  });
});

export default router;
