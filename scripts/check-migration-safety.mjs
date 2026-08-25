#!/usr/bin/env node
/**
 * Pre-migration safety check against the live database.
 *
 * The updated schema adds a unique constraint on DocumentChunk(documentId,
 * chunkIndex) plus several indexes and an errorMessage column. Applying a unique
 * constraint to a table that already contains duplicates fails partway through,
 * so this reports what is actually in the database before anything is changed.
 *
 * Read-only. Makes no schema or data changes.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GREEN = '\u001b[32m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

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

async function main() {
  const env = { ...loadDotenv(join(repoRoot, 'apps', 'backend', '.env')), ...process.env };
  const url = env.DATABASE_URL;

  if (!url) {
    console.error('DATABASE_URL not set.');
    return 1;
  }

  const clientPath = join(
    repoRoot,
    'apps',
    'backend',
    'node_modules',
    '@prisma',
    'client',
    'default.js',
  );
  const { PrismaClient } = await import(pathToFileURL(clientPath).href);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  let blocking = 0;

  try {
    console.log('\nPre-migration safety check');
    console.log(`${DIM}Read-only. Nothing is modified.${RESET}\n`);

    // --- current contents ---------------------------------------------------
    const [users, documents, chunks, conversations, messages] = await Promise.all([
      prisma.user.count(),
      prisma.document.count(),
      prisma.documentChunk.count(),
      prisma.conversation.count(),
      prisma.message.count(),
    ]);

    console.log('Current data:');
    console.log(`  users          ${users}`);
    console.log(`  documents      ${documents}`);
    console.log(`  chunks         ${chunks}`);
    console.log(`  conversations  ${conversations}`);
    console.log(`  messages       ${messages}`);

    // --- document status breakdown -----------------------------------------
    const statuses = await prisma.document.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    console.log('\nDocument status:');
    for (const row of statuses) {
      console.log(`  ${String(row.status).padEnd(12)} ${row._count._all}`);
    }

    // --- the actual blocker -------------------------------------------------
    console.log('\nUnique constraint DocumentChunk(documentId, chunkIndex):');
    const duplicates = await prisma.$queryRaw`
      SELECT [documentId], [chunkIndex], COUNT(*) AS [copies]
      FROM [DocumentChunk]
      GROUP BY [documentId], [chunkIndex]
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length === 0) {
      console.log(`  ${GREEN}safe${RESET}  no duplicate (documentId, chunkIndex) pairs`);
    } else {
      const total = duplicates.reduce((sum, row) => sum + Number(row.copies) - 1, 0);
      console.log(
        `  ${RED}BLOCKED${RESET}  ${duplicates.length} duplicated pair(s), ${total} surplus row(s)`,
      );
      console.log('');
      console.log('  The unique constraint cannot be created until these are removed.');
      console.log('  Chunks are regenerated from the blob on reprocessing, so deleting the');
      console.log('  surplus rows is safe. To remove them, keeping the oldest of each pair:');
      console.log('');
      console.log('    WITH ranked AS (');
      console.log('      SELECT [id], ROW_NUMBER() OVER (');
      console.log('        PARTITION BY [documentId], [chunkIndex] ORDER BY [createdAt]');
      console.log('      ) AS rn FROM [DocumentChunk]');
      console.log('    )');
      console.log('    DELETE FROM [DocumentChunk] WHERE [id] IN (SELECT [id] FROM ranked WHERE rn > 1);');
      blocking += 1;
    }

    // --- new column ---------------------------------------------------------
    console.log('\nNew column Document.errorMessage:');
    const column = await prisma.$queryRaw`
      SELECT [COLUMN_NAME] FROM [INFORMATION_SCHEMA].[COLUMNS]
      WHERE [TABLE_NAME] = 'Document' AND [COLUMN_NAME] = 'errorMessage'
    `;
    if (column.length > 0) {
      console.log(`  ${GREEN}present${RESET}  already applied`);
    } else {
      console.log(
        `  ${YELLOW}pending${RESET}  will be added as NULLable NVARCHAR(MAX) - no data loss`,
      );
    }

    // --- warn about the search index consequence ----------------------------
    const completed = statuses.find((s) => s.status === 'COMPLETED')?._count._all ?? 0;
    if (completed > 0) {
      console.log('\nNote on the search index:');
      console.log(
        `  ${completed} document(s) are COMPLETED. Rebuilding the search index (needed to`,
      );
      console.log('  add the userId field) clears their indexed chunks, so they will not be');
      console.log('  searchable until reprocessed. Their rows and blobs are untouched.');
    }

    console.log('\n' + '-'.repeat(72));
    if (blocking > 0) {
      console.log(`${RED}Migration would fail.${RESET} Clear the duplicates first.\n`);
      return 1;
    }
    console.log(`${GREEN}Safe to migrate.${RESET}\n`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`\nFailed: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
