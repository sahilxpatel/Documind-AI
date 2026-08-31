#!/usr/bin/env node
/**
 * Local smoke test against a running API on port 4000.
 *
 * Signs a token with the configured JWT_SECRET for a user that already exists,
 * so authenticated routes can be exercised without creating test data in the
 * database.
 *
 * Read-only: performs GETs only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:4000';

function loadDotenv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

const env = { ...loadDotenv(join(repoRoot, 'apps', 'backend', '.env')), ...process.env };

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Minimal HS256 JWT, matching what utils/jwt.ts produces (including issuer). */
function signToken(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(
    JSON.stringify({ ...payload, iss: 'documind-api', iat: now, exp: now + 600 }),
  );
  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

let failures = 0;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
}

async function probe(name, path, { token, expect, accept } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.Accept = accept;

  try {
    const res = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
    const text = await res.text();
    const ok = expect ? expect(res, text) : res.ok;
    const snippet = text.slice(0, 110).replace(/\s+/g, ' ');
    record(name, ok, `HTTP ${res.status} ${snippet}`);
  } catch (error) {
    record(name, false, error.message);
  }
}

async function main() {
  // Prefer a real user id so ownership filtering is genuinely exercised. The
  // database is not always reachable (Azure SQL only admits allow-listed IPs),
  // so fall back to a synthetic id and skip the checks that need real rows
  // rather than failing the whole run.
  let user = null;
  let doc = null;
  let dbReachable = false;

  try {
    const clientPath = join(
      repoRoot, 'apps', 'backend', 'node_modules', '@prisma', 'client', 'default.js',
    );
    const { PrismaClient } = await import(pathToFileURL(clientPath).href);
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    try {
      user = await prisma.user.findFirst({ select: { id: true, email: true } });
      doc = await prisma.document.findFirst({
        where: { userId: user?.id },
        select: { id: true, status: true },
      });
      dbReachable = true;
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    const message = String(error?.message ?? error);
    const firewalled = message.includes('not allowed to access the server');
    console.log(
      `\nDatabase not reachable${firewalled ? ' (IP not in the SQL firewall allow-list)' : ''}.`,
    );
    console.log('Running the checks that do not need database rows.\n');
  }

  const userId = user?.id ?? '00000000-0000-0000-0000-0000000000aa';
  const token = signToken({ id: userId, role: 'USER' }, env.JWT_SECRET);
  const otherToken = signToken(
    { id: '00000000-0000-0000-0000-000000000001', role: 'USER' },
    env.JWT_SECRET,
  );

  console.log(`Smoke test against ${BASE}`);
  console.log(`User id: ${userId}${user ? ' (real)' : ' (synthetic)'}`);
  console.log(`Document under test: ${doc ? `${doc.id} (${doc.status})` : 'none'}\n`);

  // --- API ---------------------------------------------------------------
  await probe('health', '/health', { expect: (r) => r.status === 200 });
  await probe('documents list (no auth)', '/api/documents', {
    expect: (r) => r.status === 401,
  });

  if (dbReachable) {
    await probe('documents list (auth)', '/api/documents', { token });
  }

  if (doc) {
    await probe('document by id (new route)', `/api/documents/${doc.id}`, {
      token,
      expect: (r, t) => r.status === 200 && t.includes('"chunkCount"'),
    });
    // Ownership is enforced in the query, so another user must get 404, not 403.
    await probe('document by id (other user)', `/api/documents/${doc.id}`, {
      token: otherToken,
      expect: (r) => r.status === 404,
    });
  }

  await probe('document by id (bad uuid)', '/api/documents/not-a-uuid', {
    token,
    expect: (r) => r.status === 400,
  });
  await probe('unknown api route', '/api/nope', {
    token,
    accept: 'application/json',
    // Must stay JSON: the SPA catch-all must not swallow /api paths.
    expect: (r, t) => r.status === 404 && t.trim().startsWith('{'),
  });

  // --- SPA ---------------------------------------------------------------
  const isHtml = (r, t) => r.status === 200 && t.includes('<div id="root"');
  await probe('SPA /', '/', { accept: 'text/html', expect: isHtml });
  await probe('SPA /dashboard', '/dashboard', { accept: 'text/html', expect: isHtml });
  await probe('SPA /documents/x/chat', '/documents/x/chat', { accept: 'text/html', expect: isHtml });
  await probe('SPA /total-nonsense', '/total-nonsense', { accept: 'text/html', expect: isHtml });
  await probe('static asset', '/favicon.svg', { expect: (r) => r.status === 200 });
  await probe('page title set', '/', {
    accept: 'text/html',
    expect: (_r, t) => t.includes('<title>DocuMind AI'),
  });

  const pad = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.detail}`);
  }

  console.log('');
  if (failures > 0) {
    console.log(`${failures} of ${results.length} checks failed.\n`);
    process.exitCode = 1;
  } else {
    console.log(`All ${results.length} checks passed.\n`);
  }
}

main().catch((error) => {
  console.error(`Unexpected failure: ${error?.stack || error}`);
  process.exitCode = 1;
});
