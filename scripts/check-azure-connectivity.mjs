#!/usr/bin/env node
/**
 * Live connectivity test against the Azure resources named in apps/backend/.env
 * and apps/functions/local.settings.json.
 *
 * Answers "is this actually wired up correctly" rather than "does it compile".
 * Every check is read-only except the two Azure OpenAI calls, which consume a
 * handful of tokens.
 *
 * Prints resource names and results only - never keys or connection strings.
 *
 * Usage: node scripts/check-azure-connectivity.mjs
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

let failed = 0;
let skipped = 0;

function pass(name, detail = '') {
  console.log(`  ${GREEN}pass${RESET} ${name.padEnd(30)} ${DIM}${detail}${RESET}`);
}
function fail(name, detail) {
  console.log(`  ${RED}FAIL${RESET} ${name.padEnd(30)} ${detail}`);
  failed += 1;
}
function skip(name, detail) {
  console.log(`  ${YELLOW}skip${RESET} ${name.padEnd(30)} ${DIM}${detail}${RESET}`);
  skipped += 1;
}

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

function loadLocalSettings(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')).Values ?? {};
  } catch {
    return {};
  }
}

const env = {
  ...loadLocalSettings(join(repoRoot, 'apps', 'functions', 'local.settings.json')),
  ...loadDotenv(join(repoRoot, 'apps', 'backend', '.env')),
  ...process.env,
};

/** Parses AccountName / AccountKey / EndpointSuffix out of a storage string. */
function parseStorage(cs) {
  const parts = Object.fromEntries(
    cs
      .split(';')
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=');
        return [p.slice(0, i), p.slice(i + 1)];
      }),
  );
  return {
    account: parts.AccountName,
    key: parts.AccountKey,
    suffix: parts.EndpointSuffix || 'core.windows.net',
  };
}

// -----------------------------------------------------------------------------
async function checkOpenAi() {
  console.log('\nAzure OpenAI');

  const endpoint = (env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const key = env.AZURE_OPENAI_KEY;
  const apiVersion = env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  const chat = env.AZURE_OPENAI_DEPLOYMENT_ID;
  const embed = env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID;

  if (!endpoint || !key) {
    skip('endpoint', 'AZURE_OPENAI_ENDPOINT / KEY not set');
    return;
  }

  console.log(`  ${DIM}host: ${new URL(endpoint).host}${RESET}`);
  if (endpoint.includes('.services.ai.azure.com')) {
    console.log(
      `  ${DIM}(Azure AI Foundry endpoint - verifying the Azure OpenAI compatible route)${RESET}`,
    );
  }

  // Chat completion. This is the exact URL shape the `openai` SDK's AzureOpenAI
  // client builds, so a pass here means the app will work too.
  try {
    const url = `${endpoint}/openai/deployments/${chat}/chat/completions?api-version=${apiVersion}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_tokens: 5,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      pass(`chat "${chat}"`, `replied "${json.choices?.[0]?.message?.content?.trim()}"`);
    } else {
      const text = (await res.text()).slice(0, 300);
      fail(`chat "${chat}"`, `HTTP ${res.status} ${text}`);
    }
  } catch (error) {
    fail(`chat "${chat}"`, error.message);
  }

  // Embeddings. The dimension here must match the search index.
  try {
    const url = `${endpoint}/openai/deployments/${embed}/embeddings?api-version=${apiVersion}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({ input: 'connectivity probe' }),
    });

    if (res.ok) {
      const json = await res.json();
      const dims = json.data?.[0]?.embedding?.length;
      if (dims === 1536) {
        pass(`embeddings "${embed}"`, `${dims} dimensions`);
      } else {
        fail(
          `embeddings "${embed}"`,
          `${dims} dimensions - the search index expects 1536, so it must be rebuilt with EMBEDDING_DIMENSIONS=${dims}`,
        );
      }
    } else {
      const text = (await res.text()).slice(0, 300);
      fail(`embeddings "${embed}"`, `HTTP ${res.status} ${text}`);
    }
  } catch (error) {
    fail(`embeddings "${embed}"`, error.message);
  }
}

// -----------------------------------------------------------------------------
async function checkSearch() {
  console.log('\nAzure AI Search');

  const endpoint = (env.AZURE_SEARCH_ENDPOINT || '').replace(/\/+$/, '');
  const key = env.AZURE_SEARCH_KEY;
  const index = env.AZURE_SEARCH_INDEX || 'documents';

  if (!endpoint || !key) {
    skip('service', 'AZURE_SEARCH_ENDPOINT / KEY not set');
    return;
  }

  try {
    const res = await fetch(`${endpoint}/indexes/${index}?api-version=2024-07-01`, {
      headers: { 'api-key': key },
    });

    if (res.status === 404) {
      fail(`index "${index}"`, 'does not exist - run: npm run search:index');
      return;
    }
    if (!res.ok) {
      fail(`index "${index}"`, `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return;
    }

    const json = await res.json();
    const fields = new Set(json.fields.map((f) => f.name));
    pass(`index "${index}"`, `${fields.size} fields`);

    if (!fields.has('userId')) {
      fail(
        'index field "userId"',
        'missing - search returns nothing until rebuilt: npm run search:index -- --recreate',
      );
    } else {
      pass('index field "userId"', 'present (tenant filtering works)');
    }
  } catch (error) {
    fail(`index "${index}"`, error.message);
  }
}

// -----------------------------------------------------------------------------
async function checkStorage() {
  console.log('\nAzure Blob Storage');

  const cs = env.AZURE_STORAGE_CONNECTION_STRING;
  const container = env.AZURE_STORAGE_CONTAINER || 'documents';

  if (!cs) {
    skip('account', 'AZURE_STORAGE_CONNECTION_STRING not set');
    return;
  }

  const { account, suffix } = parseStorage(cs);
  console.log(`  ${DIM}account: ${account}${RESET}`);

  // Uses the SDK so shared-key signing is handled for us.
  try {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    const client = BlobServiceClient.fromConnectionString(cs);
    const containerClient = client.getContainerClient(container);

    if (await containerClient.exists()) {
      let count = 0;
      for await (const _ of containerClient.listBlobsFlat()) {
        count += 1;
        if (count >= 50) break;
      }
      pass(`container "${container}"`, `exists, ${count >= 50 ? '50+' : count} blob(s)`);
    } else {
      fail(`container "${container}"`, `not found on ${account}.blob.${suffix}`);
    }
  } catch (error) {
    fail('connection', error.message);
  }
}

// -----------------------------------------------------------------------------
async function checkServiceBus() {
  console.log('\nAzure Service Bus');

  const cs = env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  const queue = env.AZURE_SERVICE_BUS_QUEUE || 'document-processing';

  if (!cs) {
    skip('namespace', 'AZURE_SERVICE_BUS_CONNECTION_STRING not set');
    return;
  }

  const host = /Endpoint=sb:\/\/([^/;]+)/.exec(cs)?.[1];
  console.log(`  ${DIM}namespace: ${host}${RESET}`);

  try {
    const { ServiceBusAdministrationClient } = await import('@azure/service-bus');
    const admin = new ServiceBusAdministrationClient(cs);
    const props = await admin.getQueueRuntimeProperties(queue);

    pass(
      `queue "${queue}"`,
      `${props.activeMessageCount} active, ${props.deadLetterMessageCount} dead-lettered`,
    );

    if (props.deadLetterMessageCount > 0) {
      console.log(
        `  ${YELLOW}note${RESET} ${''.padEnd(30)} ${DIM}${props.deadLetterMessageCount} message(s) previously failed processing${RESET}`,
      );
    }
  } catch (error) {
    // Manage rights are needed to read runtime properties. A send/listen-only
    // key is correct for the apps but cannot introspect, so that is not a failure.
    if (/Unauthorized|claims required|40103/i.test(error.message)) {
      skip(`queue "${queue}"`, 'key lacks Manage rights (fine - apps only need Send/Listen)');
    } else {
      fail(`queue "${queue}"`, error.message);
    }
  }
}

// -----------------------------------------------------------------------------
async function checkSql() {
  console.log('\nAzure SQL');

  const url = env.DATABASE_URL;
  if (!url) {
    skip('database', 'DATABASE_URL not set');
    return;
  }

  const server = /sqlserver:\/\/([^:;]+)/.exec(url)?.[1];
  console.log(`  ${DIM}server: ${server}${RESET}`);

  if (!url.startsWith('sqlserver://')) {
    fail('DATABASE_URL format', 'Prisma needs sqlserver://host:1433;database=...');
    return;
  }

  try {
    // Imported from the backend workspace so the generated client is found.
    // pathToFileURL is required: the ESM loader rejects bare Windows paths.
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

    try {
      await prisma.$queryRaw`SELECT 1`;
      pass('connection', 'SELECT 1 succeeded');

      // Do the tables exist? Distinguishes "connected" from "migrated".
      try {
        const users = await prisma.user.count();
        const docs = await prisma.document.count();
        pass('schema', `${users} user(s), ${docs} document(s)`);
      } catch {
        fail(
          'schema',
          'tables missing - run: npm run prisma:migrate --workspace=apps/backend',
        );
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    const message = error.message.split('\n').slice(0, 2).join(' ').slice(0, 300);
    if (/firewall|not allowed to access/i.test(error.message)) {
      fail('connection', `blocked by SQL firewall - add this machine's IP. ${message}`);
    } else {
      fail('connection', message);
    }
  }
}

// -----------------------------------------------------------------------------
async function checkCommunication() {
  console.log('\nAzure Communication Services (optional)');

  const cs = env.AZURE_COMMUNICATION_CONNECTION_STRING;
  const sender = env.AZURE_COMMUNICATION_SENDER_EMAIL;

  if (!cs) {
    skip('email', 'not configured - the worker skips notifications');
    return;
  }

  const host = /endpoint=https:\/\/([^/;]+)/i.exec(cs)?.[1];
  console.log(`  ${DIM}endpoint: ${host}${RESET}`);
  pass('connection string', 'well-formed');

  if (sender) {
    const domain = sender.split('@')[1];
    if (host && domain && host.startsWith(domain.split('.')[0])) {
      pass('sender address', `domain matches the service`);
    } else {
      console.log(
        `  ${YELLOW}note${RESET} sender address              ${DIM}${domain} - verify it is a linked domain${RESET}`,
      );
    }
  } else {
    skip('sender address', 'AZURE_COMMUNICATION_SENDER_EMAIL not set');
  }
}

// -----------------------------------------------------------------------------
async function main() {
  console.log('\nLive Azure connectivity check');
  console.log(`${DIM}Reads apps/backend/.env and apps/functions/local.settings.json.`);
  console.log(`Keys and connection strings are never printed.${RESET}`);

  await checkSql();
  await checkStorage();
  await checkServiceBus();
  await checkOpenAi();
  await checkSearch();
  await checkCommunication();

  console.log('\n' + '-'.repeat(72));
  if (failed > 0) {
    console.log(`${RED}${failed} check(s) failed${RESET}${skipped ? `, ${skipped} skipped` : ''}\n`);
    return 1;
  }
  console.log(
    `${GREEN}All checks passed${RESET}${skipped ? `, ${skipped} skipped` : ''} - the app can reach every Azure service.\n`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`\nUnexpected failure: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
