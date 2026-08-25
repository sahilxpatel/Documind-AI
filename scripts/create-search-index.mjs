#!/usr/bin/env node
/**
 * Creates or updates the Azure AI Search index that backs document chat and
 * global search.
 *
 * Nothing else in the project provisions this index: Bicep creates the search
 * *service* but the REST API is the only way to define an index, so without this
 * step every upload fails at the indexing stage and every query returns 404.
 *
 * Idempotent - safe to run on every deployment. Uses the REST API directly so it
 * has no npm dependencies and can run before any workspace is installed.
 *
 * Required environment variables:
 *   AZURE_SEARCH_ENDPOINT  https://<service>.search.windows.net
 *   AZURE_SEARCH_KEY       admin key (query keys cannot create indexes)
 *   AZURE_SEARCH_INDEX     index name (default: documents)
 *
 * Optional:
 *   EMBEDDING_DIMENSIONS   vector width (default: 1536, for text-embedding-3-small)
 */

const API_VERSION = '2024-07-01';

const endpoint = (process.env.AZURE_SEARCH_ENDPOINT || '').replace(/\/+$/, '');
const apiKey = process.env.AZURE_SEARCH_KEY;
const indexName = process.env.AZURE_SEARCH_INDEX || 'documents';
const dimensions = Number(process.env.EMBEDDING_DIMENSIONS || 1536);

if (!endpoint || !apiKey) {
  console.error(
    'AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_KEY must be set (the admin key, not a query key).',
  );
  process.exit(1);
}

/**
 * Field definitions must match what the worker uploads (apps/functions) and what
 * the API filters and selects on (apps/backend/src/services/search.service.ts).
 */
const indexDefinition = {
  name: indexName,
  fields: [
    {
      // Search keys accept only letters, digits, _, - and =. The worker builds
      // them as `${documentId}-${chunkIndex}`.
      name: 'id',
      type: 'Edm.String',
      key: true,
      searchable: false,
      // Documents are deleted by key, and nothing filters on id, so leaving this
      // off keeps the index smaller.
      filterable: false,
      sortable: false,
      facetable: false,
    },
    {
      name: 'documentId',
      type: 'Edm.String',
      searchable: false,
      filterable: true,
      sortable: false,
      facetable: true,
    },
    {
      // Filterable is essential: the API scopes every query to the caller with
      // `userId eq '...'` as a pre-filter, which is what isolates tenants.
      name: 'userId',
      type: 'Edm.String',
      searchable: false,
      filterable: true,
      sortable: false,
      facetable: false,
    },
    {
      name: 'documentTitle',
      type: 'Edm.String',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
      analyzer: 'standard.lucene',
    },
    {
      name: 'chunkIndex',
      type: 'Edm.Int32',
      searchable: false,
      filterable: true,
      sortable: true,
      facetable: false,
    },
    {
      // Searchable so hybrid search can combine BM25 keyword scoring with the
      // vector similarity below.
      name: 'content',
      type: 'Edm.String',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
      analyzer: 'standard.lucene',
    },
    {
      name: 'contentVector',
      type: 'Collection(Edm.Single)',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
      retrievable: false,
      dimensions,
      vectorSearchProfile: 'documind-vector-profile',
    },
  ],
  vectorSearch: {
    algorithms: [
      {
        name: 'documind-hnsw',
        kind: 'hnsw',
        hnswParameters: {
          // Cosine matches how OpenAI embeddings are normalised.
          metric: 'cosine',
          m: 4,
          efConstruction: 400,
          efSearch: 500,
        },
      },
    ],
    profiles: [
      {
        name: 'documind-vector-profile',
        algorithm: 'documind-hnsw',
      },
    ],
  },
  semantic: {
    configurations: [
      {
        name: 'documind-semantic',
        prioritizedFields: {
          titleField: { fieldName: 'documentTitle' },
          prioritizedContentFields: [{ fieldName: 'content' }],
          prioritizedKeywordsFields: [],
        },
      },
    ],
  },
};

// Deleting an index throws away every indexed chunk, so it is opt-in.
const allowRecreate =
  process.argv.includes('--recreate') || process.env.RECREATE_INDEX === 'true';

async function request(method, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

/**
 * Azure AI Search allows *adding* fields to a live index, but rejects changes to
 * an existing field's type or vector configuration. Detect that case up front so
 * the failure is an actionable message rather than an opaque 400 mid-deploy.
 */
function findBlockingChanges(existingIndex) {
  const blocking = [];
  const existingFields = new Map(existingIndex.fields.map((f) => [f.name, f]));

  for (const desired of indexDefinition.fields) {
    const current = existingFields.get(desired.name);
    if (!current) continue; // new field - additive, allowed

    if (current.type !== desired.type) {
      blocking.push(`field "${desired.name}" type ${current.type} -> ${desired.type}`);
    }
    if (desired.dimensions && current.dimensions && current.dimensions !== desired.dimensions) {
      blocking.push(
        `field "${desired.name}" dimensions ${current.dimensions} -> ${desired.dimensions}`,
      );
    }
    if (
      desired.vectorSearchProfile &&
      current.vectorSearchProfile &&
      current.vectorSearchProfile !== desired.vectorSearchProfile
    ) {
      blocking.push(
        `field "${desired.name}" vector profile "${current.vectorSearchProfile}" -> "${desired.vectorSearchProfile}"`,
      );
    }
    // Turning on filterable/searchable for an existing field also requires a
    // rebuild: those flags decide how the field was physically indexed.
    if (desired.filterable && current.filterable === false) {
      blocking.push(`field "${desired.name}" must become filterable`);
    }
    if (desired.searchable && current.searchable === false) {
      blocking.push(`field "${desired.name}" must become searchable`);
    }
  }

  return blocking;
}

class IndexError extends Error {}

async function putIndex(action) {
  const result = await request(
    'PUT',
    `/indexes/${indexName}?api-version=${API_VERSION}`,
    indexDefinition,
  );

  if (!result.ok) {
    throw new IndexError(`Failed to ${action} index (HTTP ${result.status})\n${result.text}`);
  }
}

async function main() {
  console.log(`Ensuring index "${indexName}" on ${endpoint} (${dimensions} dimensions)`);

  const existing = await request('GET', `/indexes/${indexName}?api-version=${API_VERSION}`);

  if (existing.status === 404) {
    await putIndex('create');
    console.log('Index created.');
    return;
  }

  if (!existing.ok) {
    throw new IndexError(
      `Could not read the existing index (HTTP ${existing.status})\n${existing.text}`,
    );
  }

  const blocking = findBlockingChanges(JSON.parse(existing.text));

  if (blocking.length === 0) {
    await putIndex('update');
    console.log('Index updated in place.');
    return;
  }

  console.log('\nThe existing index cannot be updated in place. Blocking changes:');
  for (const change of blocking) console.log(`  - ${change}`);

  if (!allowRecreate) {
    throw new IndexError(
      [
        '',
        'Refusing to delete the index without an explicit instruction.',
        'Re-run with --recreate (or RECREATE_INDEX=true) to drop and rebuild it.',
        '',
        'Rebuilding discards all indexed chunks. Document rows and blobs are',
        're-processed afterwards to become searchable again.',
      ].join('\n'),
    );
  }

  console.log('\n--recreate given: deleting and rebuilding the index.');
  const deleted = await request('DELETE', `/indexes/${indexName}?api-version=${API_VERSION}`);

  if (!deleted.ok && deleted.status !== 404) {
    throw new IndexError(`Failed to delete the index (HTTP ${deleted.status})\n${deleted.text}`);
  }

  await putIndex('recreate');
  console.log('Index recreated. Existing documents must be re-processed to be searchable.');
}

// Set exitCode instead of calling process.exit(): fetch keeps pooled sockets
// open, and tearing the process down underneath them crashes libuv on Windows
// (and would mask the real exit status).
main().catch((error) => {
  console.error(error instanceof IndexError ? error.message : `Unexpected failure: ${error}`);
  process.exitCode = 1;
});
