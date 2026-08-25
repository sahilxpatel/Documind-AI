#!/usr/bin/env node
/**
 * Read-only inspection of the live Azure AI Search index.
 *
 * Reports whether the index exists and whether its fields match what the code
 * expects (see scripts/create-search-index.mjs). Makes no changes.
 *
 * Exit codes: 0 compatible, 1 could not check, 2 incompatible.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadDotenv(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[line.slice(0, eq).trim()] = value;
  }
  return values;
}

// Fields the application reads, writes or filters on.
const REQUIRED = {
  id: { key: true },
  documentId: { filterable: true },
  userId: { filterable: true },
  content: { searchable: true },
  contentVector: { vector: true },
};
const OPTIONAL = ['documentTitle', 'chunkIndex'];

async function main() {
  const env = { ...loadDotenv(join(repoRoot, 'apps', 'backend', '.env')), ...process.env };

  const endpoint = (env.AZURE_SEARCH_ENDPOINT || '').replace(/\/+$/, '');
  const apiKey = env.AZURE_SEARCH_KEY;
  const indexName = env.AZURE_SEARCH_INDEX || 'documents';

  if (!endpoint || !apiKey) {
    console.error('AZURE_SEARCH_ENDPOINT / AZURE_SEARCH_KEY not found.');
    return 1;
  }

  const response = await fetch(`${endpoint}/indexes/${indexName}?api-version=2024-07-01`, {
    headers: { 'api-key': apiKey },
  });

  console.log(`\nIndex "${indexName}" on ${endpoint}`);
  console.log(`HTTP ${response.status}\n`);

  if (response.status === 404) {
    console.log('Index does NOT exist.');
    console.log('Every document upload will fail at the indexing step until it is created.');
    console.log('Create it with:  npm run search:index\n');
    return 2;
  }

  if (!response.ok) {
    console.error(await response.text());
    return 1;
  }

  const index = await response.json();
  const byName = new Map(index.fields.map((f) => [f.name, f]));

  console.log('Existing fields:');
  for (const field of index.fields) {
    const flags = [
      field.key ? 'key' : null,
      field.searchable ? 'searchable' : null,
      field.filterable ? 'filterable' : null,
      field.sortable ? 'sortable' : null,
      field.dimensions ? `dims=${field.dimensions}` : null,
    ].filter(Boolean);
    console.log(
      `  - ${field.name.padEnd(16)} ${String(field.type).padEnd(28)} ${flags.join(', ')}`,
    );
  }

  console.log('\nCompatibility with the application:');
  let problems = 0;

  for (const [name, expect] of Object.entries(REQUIRED)) {
    const field = byName.get(name);
    if (!field) {
      console.log(`  MISSING  ${name}`);
      problems += 1;
      continue;
    }
    if (expect.filterable && !field.filterable) {
      console.log(`  PROBLEM  ${name} exists but is not filterable (needed for query filters)`);
      problems += 1;
      continue;
    }
    if (expect.searchable && !field.searchable) {
      console.log(`  PROBLEM  ${name} exists but is not searchable (needed for hybrid search)`);
      problems += 1;
      continue;
    }
    console.log(`  ok       ${name}`);
  }

  for (const name of OPTIONAL) {
    console.log(
      byName.has(name) ? `  ok       ${name} (optional)` : `  absent   ${name} (optional)`,
    );
  }

  const profiles = index.vectorSearch?.profiles?.map((p) => p.name) ?? [];
  console.log(`\nVector search profiles: ${profiles.length ? profiles.join(', ') : '(none)'}`);
  if (profiles.length === 0) {
    console.log('  PROBLEM  no vector search profile - vector queries cannot run');
    problems += 1;
  }

  const vectorField = byName.get('contentVector');
  if (vectorField?.dimensions) {
    console.log(`Vector dimensions: ${vectorField.dimensions}`);
    if (vectorField.dimensions !== 1536) {
      console.log(
        '  NOTE  text-embedding-3-small emits 1536. A mismatch means the index must be rebuilt.',
      );
    }
  }

  console.log('');
  if (problems > 0) {
    console.log(`${problems} problem(s). Fix by running: npm run search:index`);
    console.log('Adding a new filterable field to an existing index is allowed; changing a');
    console.log('field type, its vector profile or the vector dimension requires deleting and');
    console.log('rebuilding it (npm run search:index -- --recreate), followed by');
    console.log('re-processing documents.\n');
    return 2;
  }

  console.log('Index is compatible with the application.\n');
  return 0;
}

// exitCode rather than process.exit(): fetch keeps pooled sockets open, and
// tearing the process down underneath them crashes libuv on Windows.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`Unexpected failure: ${error}`);
    process.exitCode = 1;
  });
