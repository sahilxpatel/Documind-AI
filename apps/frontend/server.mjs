/**
 * Minimal static file server for the built SPA on Azure App Service (Linux).
 *
 * Why this exists instead of the usual `pm2 serve --spa` startup command: pm2 is
 * no longer bundled in the App Service Node 20+ images, so that command fails at
 * container start. `npx serve` would work but adds a network download to every
 * cold start. This uses only Node built-ins, so it has no install step and no
 * dependency to keep patched.
 *
 * Deployed alongside the contents of `dist/`, and started with `node server.mjs`.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.dirname only exists from Node 20.11, so derive it from the URL.
const here = dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT) || 8080;
const root = resolve(process.env.STATIC_ROOT || here);
const indexFile = join(root, 'index.html');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/**
 * Resolves a request path to a file inside `root`, or null if it escapes the
 * root. Without this check, a request for `/../../etc/passwd` would be served.
 */
function resolveSafePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }

  const candidate = resolve(join(root, normalize(decoded)));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  return candidate;
}

function sendFile(res, filePath, status = 200, extraHeaders = {}) {
  const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';

  res.writeHead(status, {
    'Content-Type': type,
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });

  createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end('Internal Server Error');
    })
    .pipe(res);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS });
    return res.end('Method Not Allowed');
  }

  // Lets App Service (and any uptime monitor) verify the container is serving.
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
    return res.end(JSON.stringify({ status: 'ok' }));
  }

  const filePath = resolveSafePath(req.url || '/');
  if (!filePath) {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end('Bad Request');
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    // Vite emits content-hashed filenames under /assets, so those are safe to
    // cache indefinitely. Everything else must revalidate or clients would keep
    // a stale index.html pointing at deleted bundles after a deploy.
    const immutable = req.url.startsWith('/assets/');
    return sendFile(res, filePath, 200, {
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
    });
  }

  // SPA fallback: unknown paths are client-side routes (/dashboard,
  // /documents/:id/chat), so serve the shell and let the router handle it.
  // Without this, refreshing any deep link returns 404.
  if (existsSync(indexFile)) {
    return sendFile(res, indexFile, 200, {
      'Cache-Control': 'no-cache, must-revalidate',
    });
  }

  res.writeHead(404, SECURITY_HEADERS);
  res.end('Not Found');
});

server.listen(port, () => {
  process.stdout.write(`Static server listening on ${port}, serving ${root}\n`);
});

// App Service sends SIGTERM before recycling the container.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
