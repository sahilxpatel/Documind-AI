#!/usr/bin/env node
/**
 * Verifies the deployed application from the outside.
 *
 * Signs a token with the local JWT_SECRET (the same value deployed) so
 * authenticated routes can be exercised end to end. Read-only: GETs only.
 */
import { readFileSync, existsSync } from 'node:fs';
import crypto, { createHmac } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL || '').replace(/\/+$/, '');

if (!BASE) {
  console.error('Set BASE_URL to the deployed origin.');
  process.exit(1);
}

function loadDotenv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadDotenv(join(repoRoot, 'apps', 'backend', '.env')), ...process.env };

const b64 = (s) =>
  Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function signToken(payload) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ ...payload, iss: 'documind-api', iat: now, exp: now + 600 }));
  const sig = createHmac('sha256', env.JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

const rows = [];
let failed = 0;

function add(name, ok, detail) {
  rows.push({ name, ok, detail });
  if (!ok) failed += 1;
}

async function get(path, { token, accept } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.Accept = accept;
  const res = await fetch(`${BASE}${path}`, { headers });
  return { res, text: await res.text() };
}

async function main() {
  const token = signToken({ id: '00000000-0000-0000-0000-0000000000aa', role: 'USER' });

  console.log(`\nVerifying ${BASE}\n`);

  // --- App can reach its dependencies -------------------------------------
  {
    const { res, text } = await get('/health/ready');
    let checks = {};
    try {
      checks = JSON.parse(text).checks ?? {};
    } catch {
      /* ignore */
    }
    add('readiness (overall)', res.status === 200, `HTTP ${res.status}`);
    for (const [dep, value] of Object.entries(checks)) {
      // database is the gate; the rest are reported for information.
      add(`  dependency: ${dep}`, value.status === 'up', value.detail ?? value.status);
    }
  }

  // --- Authenticated route hits the database ------------------------------
  {
    const { res, text } = await get('/api/documents', { token });
    let ok = res.status === 200;
    let detail = `HTTP ${res.status}`;
    if (ok) {
      try {
        const body = JSON.parse(text);
        ok = Array.isArray(body.documents) && typeof body.pagination?.total === 'number';
        detail = `HTTP 200, ${body.documents.length} documents, total ${body.pagination?.total}`;
      } catch {
        ok = false;
        detail = 'HTTP 200 but body was not the expected shape';
      }
    } else {
      detail += ` ${text.slice(0, 120)}`;
    }
    add('documents list (authenticated)', ok, detail);
  }

  // --- The new single-document route --------------------------------------
  {
    // Must be a genuine v4 UUID: the route validates with Zod's .uuid(), which
    // checks the version and variant bits, not just the dash layout.
    const orphanId = crypto.randomUUID();
    const { res } = await get(`/api/documents/${orphanId}`, { token });
    // 404 proves the request reached the database and the ownership filter ran.
    add('document by id (new route)', res.status === 404, `HTTP ${res.status} for ${orphanId}`);

    const bad = await get('/api/documents/not-a-uuid', { token });
    add('document by id rejects bad input', bad.res.status === 400, `HTTP ${bad.res.status}`);
  }

  // --- The deployed bundle is the new one ---------------------------------
  {
    const { res, text } = await get('/', { accept: 'text/html' });
    const title = /<title>([^<]*)<\/title>/.exec(text)?.[1] ?? '';
    add('new page title deployed', title.startsWith('DocuMind AI'), title || '(none)');

    // Vite emits the entry as <script src> and the split chunks as
    // <link rel="modulepreload">; both must be served or the page half-loads.
    const scripts = [
      ...[...text.matchAll(/src="(\/assets\/[^"]+)"/g)].map((m) => m[1]),
      ...[...text.matchAll(/rel="modulepreload"[^>]*href="(\/assets\/[^"]+)"/g)].map((m) => m[1]),
    ];
    const css = [...text.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]);
    add('bundle references assets', scripts.length > 0, `${scripts.length} scripts, ${css.length} css`);

    // framer-motion was removed; a motion chunk means an older bundle is live.
    add(
      'framer-motion chunk gone',
      !scripts.some((s) => s.includes('motion-')),
      scripts.join(', ').slice(0, 90),
    );

    // Every referenced asset must actually be served, or the page is broken.
    for (const asset of [...scripts, ...css].slice(0, 6)) {
      const { res: assetRes } = await get(asset);
      add(`  asset ${asset.slice(0, 34)}`, assetRes.status === 200, `HTTP ${assetRes.status}`);
    }
  }

  // --- Security headers ----------------------------------------------------
  {
    const { res } = await get('/');
    const csp = res.headers.get('x-content-type-options');
    add('security headers present', csp === 'nosniff', `x-content-type-options: ${csp}`);
  }

  const pad = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.detail}`);
  }

  console.log('');
  if (failed > 0) {
    console.log(`${failed} of ${rows.length} checks failed.\n`);
    process.exitCode = 1;
  } else {
    console.log(`All ${rows.length} checks passed.\n`);
  }
}

main().catch((error) => {
  console.error(`Unexpected failure: ${error?.stack || error}`);
  process.exitCode = 1;
});
