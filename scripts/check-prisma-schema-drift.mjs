#!/usr/bin/env node
/**
 * Fails the build if the Functions app's copy of the Prisma schema has drifted
 * from the canonical one in apps/backend.
 *
 * The copy exists because Azure Functions deployment packages are isolated and
 * cannot reach into apps/backend/node_modules (which is what the worker used to
 * do). Each app therefore generates its own client from its own schema file, and
 * this check keeps the two definitions honest.
 *
 * Comments and blank lines are ignored so each file can carry its own header.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CANONICAL = join(repoRoot, 'apps', 'backend', 'prisma', 'schema.prisma');
const COPY = join(repoRoot, 'apps', 'functions', 'prisma', 'schema.prisma');

/** Strips comments and blank lines, and normalises whitespace. */
function normalise(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, '').trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n');
}

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`Cannot read ${path}: ${error.message}`);
    process.exit(1);
  }
}

const canonical = normalise(read(CANONICAL));
const copy = normalise(read(COPY));

if (canonical === copy) {
  console.log('Prisma schemas are in sync.');
  process.exit(0);
}

console.error('Prisma schema drift detected between:');
console.error(`  canonical: apps/backend/prisma/schema.prisma`);
console.error(`  copy:      apps/functions/prisma/schema.prisma`);
console.error('');

const canonicalLines = canonical.split('\n');
const copyLines = copy.split('\n');
const max = Math.max(canonicalLines.length, copyLines.length);

for (let i = 0; i < max; i += 1) {
  if (canonicalLines[i] !== copyLines[i]) {
    console.error(`First difference at normalised line ${i + 1}:`);
    console.error(`  backend:   ${canonicalLines[i] ?? '(end of file)'}`);
    console.error(`  functions: ${copyLines[i] ?? '(end of file)'}`);
    break;
  }
}

console.error('');
console.error('Fix by copying the canonical schema over the functions copy:');
console.error('  cp apps/backend/prisma/schema.prisma apps/functions/prisma/schema.prisma');
console.error('  (then restore the header comment if you want to keep it)');
process.exit(1);
