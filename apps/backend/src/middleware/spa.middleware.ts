import express, { Express, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Serves the built SPA from the same App Service as the API.
 *
 * The deployed environment has a single App Service, so hosting the UI here
 * avoids provisioning a second one. It also removes two whole classes of
 * problem: same-origin requests need no CORS allow-list, and the frontend can use
 * relative URLs instead of having the API origin baked in at build time.
 *
 * Does nothing when the directory is absent, so the API still runs on its own
 * locally and in any deployment where the frontend is hosted separately.
 *
 * Must be mounted after the API routes and before the 404 handler: the catch-all
 * would otherwise swallow unknown /api paths and return index.html for them.
 */
export function mountSpa(app: Express): boolean {
  if (!config.SERVE_STATIC_DIR) return false;

  // Relative paths resolve against the app root (one level above dist/).
  const staticDir = isAbsolute(config.SERVE_STATIC_DIR)
    ? config.SERVE_STATIC_DIR
    : resolve(__dirname, '..', '..', config.SERVE_STATIC_DIR);

  const indexFile = join(staticDir, 'index.html');

  if (!existsSync(indexFile)) {
    logger.info('No SPA bundle found, running API only', { staticDir });
    return false;
  }

  app.use(
    express.static(staticDir, {
      // Vite emits content-hashed filenames under /assets, so those can be cached
      // indefinitely. index.html must always revalidate or a returning visitor
      // keeps a stale shell pointing at bundles that no longer exist.
      setHeaders(res, filePath) {
        if (filePath.includes(`${'assets'}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      },
      index: false,
      // Let the SPA fallback below handle unknown paths.
      fallthrough: true,
    }),
  );

  // SPA fallback for client-side routes (/dashboard, /documents/:id/chat).
  // Without it, refreshing a deep link returns 404.
  app.get(/^(?!\/api\/)(?!\/health).*/, (req: Request, res: Response, next) => {
    // Never hand HTML to a non-GET or an API/asset request.
    if (req.method !== 'GET') return next();
    if (req.accepts('html')) {
      return res.sendFile(indexFile, {
        headers: { 'Cache-Control': 'no-cache, must-revalidate' },
      });
    }
    return next();
  });

  logger.info('Serving SPA bundle', { staticDir });
  return true;
}
