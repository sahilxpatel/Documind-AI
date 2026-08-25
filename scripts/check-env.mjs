#!/usr/bin/env node
/**
 * Local environment linter.
 *
 * Checks that a .env / local.settings.json file has the keys the code actually
 * reads, and that the values satisfy the constraints enforced at startup.
 *
 * Prints key names, value lengths and pass/fail only - never the values
 * themselves - so it is safe to run with output attached to a ticket or CI log.
 *
 * Usage: node scripts/check-env.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
let warnings = 0;

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

function parseDotenv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function parseLocalSettings(contents) {
  const parsed = JSON.parse(contents);
  return parsed.Values ?? {};
}

function load(path) {
  if (!existsSync(path)) return null;
  const contents = readFileSync(path, 'utf8');
  return path.endsWith('.json') ? parseLocalSettings(contents) : parseDotenv(contents);
}

function report(status, key, detail) {
  const colour = status === 'ok' ? GREEN : status === 'warn' ? YELLOW : RED;
  const mark = status === 'ok' ? 'ok  ' : status === 'warn' ? 'warn' : 'FAIL';
  console.log(`  ${colour}${mark}${RESET} ${key.padEnd(42)} ${DIM}${detail}${RESET}`);
  if (status === 'fail') failures += 1;
  if (status === 'warn') warnings += 1;
}

/**
 * @param {object} spec
 * @param {'required'|'optional'} spec.level
 * @param {(value: string) => string | null} [spec.validate] returns an error message or null
 */
function check(values, key, spec) {
  const value = values[key];

  if (!value) {
    if (spec.level === 'required') {
      report('fail', key, 'missing or empty');
    } else {
      report('warn', key, 'not set (optional)');
    }
    return;
  }

  const error = spec.validate ? spec.validate(value) : null;
  if (error) {
    report('fail', key, error);
  } else {
    report('ok', key, `${value.length} chars`);
  }
}

// --- validators --------------------------------------------------------------

const isPrismaSqlServerUrl = (value) => {
  if (!value.startsWith('sqlserver://')) {
    return value.toLowerCase().startsWith('server=')
      ? 'ADO.NET format - Prisma needs sqlserver://host:1433;database=...'
      : 'must start with sqlserver://';
  }
  if (!/;database=/i.test(value)) return 'missing ;database=';
  if (!/;user=/i.test(value)) return 'missing ;user=';
  if (!/;password=/i.test(value)) return 'missing ;password=';
  if (!/;encrypt=true/i.test(value)) return 'missing ;encrypt=true (required for Azure SQL)';
  return null;
};

const minLength = (n) => (value) =>
  value.length < n ? `${value.length} chars, needs at least ${n}` : null;

const isHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return `must be https, got ${url.protocol}`;
    return null;
  } catch {
    return 'not a valid URL';
  }
};

const noTrailingApi = (value) => {
  try {
    const url = new URL(value);
    if (url.pathname.replace(/\/+$/, '').endsWith('/api')) {
      return 'must be the ORIGIN only - drop the /api suffix (call sites add it)';
    }
    if (url.pathname.replace(/\/+$/, '') !== '') {
      return `must be origin only, has path "${url.pathname}"`;
    }
    return null;
  } catch {
    return 'not a valid URL';
  }
};

const hasEndpointAndKey = (name) => (value) =>
  value.includes(`${name}=`) ? null : `missing ${name}=`;

// --- targets -----------------------------------------------------------------

const targets = [
  {
    label: 'API  (apps/backend/.env)',
    path: join(repoRoot, 'apps', 'backend', '.env'),
    checks: (values) => {
      check(values, 'DATABASE_URL', { level: 'required', validate: isPrismaSqlServerUrl });
      check(values, 'JWT_SECRET', { level: 'required', validate: minLength(32) });
      check(values, 'AZURE_STORAGE_CONNECTION_STRING', {
        level: 'required',
        validate: hasEndpointAndKey('AccountKey'),
      });
      check(values, 'AZURE_SERVICE_BUS_CONNECTION_STRING', {
        level: 'required',
        validate: hasEndpointAndKey('SharedAccessKey'),
      });
      check(values, 'AZURE_OPENAI_ENDPOINT', { level: 'required', validate: isHttpsUrl });
      check(values, 'AZURE_OPENAI_KEY', { level: 'required' });
      check(values, 'AZURE_OPENAI_DEPLOYMENT_ID', { level: 'required' });
      check(values, 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID', { level: 'required' });
      check(values, 'AZURE_SEARCH_ENDPOINT', { level: 'required', validate: isHttpsUrl });
      check(values, 'AZURE_SEARCH_KEY', { level: 'required' });
      check(values, 'AZURE_SEARCH_INDEX', { level: 'optional' });
      check(values, 'CORS_ORIGINS', { level: 'optional' });
      check(values, 'NODE_ENV', { level: 'optional' });
      check(values, 'PORT', { level: 'optional' });
      check(values, 'AZURE_STORAGE_CONTAINER', { level: 'optional' });
      check(values, 'AZURE_SERVICE_BUS_QUEUE', { level: 'optional' });
      check(values, 'AZURE_OPENAI_API_VERSION', { level: 'optional' });
    },
  },
  {
    label: 'Worker  (apps/functions/local.settings.json)',
    path: join(repoRoot, 'apps', 'functions', 'local.settings.json'),
    checks: (values) => {
      check(values, 'AzureWebJobsStorage', { level: 'required' });
      check(values, 'FUNCTIONS_WORKER_RUNTIME', {
        level: 'required',
        validate: (v) => (v === 'node' ? null : `expected "node", got "${v}"`),
      });
      check(values, 'DATABASE_URL', { level: 'required', validate: isPrismaSqlServerUrl });
      check(values, 'AZURE_STORAGE_CONNECTION_STRING', {
        level: 'required',
        validate: hasEndpointAndKey('AccountKey'),
      });
      check(values, 'AZURE_SERVICE_BUS_CONNECTION_STRING', {
        level: 'required',
        validate: hasEndpointAndKey('SharedAccessKey'),
      });
      check(values, 'AZURE_OPENAI_ENDPOINT', { level: 'required', validate: isHttpsUrl });
      check(values, 'AZURE_OPENAI_KEY', { level: 'required' });
      check(values, 'AZURE_OPENAI_DEPLOYMENT_ID', { level: 'required' });
      check(values, 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID', { level: 'required' });
      check(values, 'AZURE_SEARCH_ENDPOINT', { level: 'required', validate: isHttpsUrl });
      check(values, 'AZURE_SEARCH_KEY', { level: 'required' });
      check(values, 'AZURE_SEARCH_INDEX', { level: 'optional' });
      check(values, 'AZURE_COMMUNICATION_CONNECTION_STRING', { level: 'optional' });
      check(values, 'AZURE_COMMUNICATION_SENDER_EMAIL', { level: 'optional' });
    },
  },
  {
    label: 'Web  (apps/frontend/.env)',
    path: join(repoRoot, 'apps', 'frontend', '.env'),
    checks: (values) => {
      check(values, 'VITE_API_URL', { level: 'optional', validate: noTrailingApi });
    },
  },
];

console.log('\nEnvironment configuration check');
console.log('(values are never printed - only key names, lengths and results)\n');

for (const target of targets) {
  const values = load(target.path);
  console.log(`${target.label}  ${DIM}${relative(repoRoot, target.path)}${RESET}`);

  if (!values) {
    report('fail', '(file)', 'not found');
    console.log('');
    continue;
  }

  target.checks(values);
  console.log('');
}

// --- cross-file consistency --------------------------------------------------
const api = load(join(repoRoot, 'apps', 'backend', '.env')) ?? {};
const worker = load(join(repoRoot, 'apps', 'functions', 'local.settings.json')) ?? {};

console.log('Cross-component consistency');

const mustMatch = [
  'DATABASE_URL',
  'AZURE_STORAGE_CONNECTION_STRING',
  'AZURE_SEARCH_ENDPOINT',
  'AZURE_SEARCH_INDEX',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID',
];

for (const key of mustMatch) {
  const a = api[key];
  const b = worker[key];
  if (!a || !b) {
    report('warn', key, 'not set in both API and worker - cannot compare');
  } else if (a !== b) {
    report(
      'fail',
      key,
      'API and worker disagree - they must point at the same resource',
    );
  } else {
    report('ok', key, 'API and worker agree');
  }
}

console.log('');
if (failures > 0) {
  console.log(`${RED}${failures} problem(s) found${RESET}${warnings ? `, ${warnings} warning(s)` : ''}\n`);
  process.exit(1);
}
console.log(`${GREEN}All required settings present and well-formed${RESET}${warnings ? `, ${warnings} warning(s)` : ''}\n`);
