import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Shape of a document in the Azure AI Search index, matching the definition in
 * scripts/create-search-index.mjs.
 *
 * `contentVector` is declared so it can be named as a vector search field, but it
 * is never selected: the index marks it non-retrievable, and returning 1536
 * floats per hit would dominate the response payload.
 */
export interface ChunkDocument {
  id: string;
  documentId: string;
  userId: string;
  documentTitle?: string;
  chunkIndex?: number;
  content: string;
  contentVector?: number[];
}

/** An index hit plus its relevance score. */
export interface ChunkHit extends ChunkDocument {
  score: number;
}

let client: SearchClient<ChunkDocument> | null = null;

function getClient(): SearchClient<ChunkDocument> {
  if (!config.AZURE_SEARCH_ENDPOINT || !config.AZURE_SEARCH_KEY) {
    throw new AppError(503, 'Search is not configured');
  }

  if (!client) {
    client = new SearchClient<ChunkDocument>(
      config.AZURE_SEARCH_ENDPOINT,
      config.AZURE_SEARCH_INDEX,
      new AzureKeyCredential(config.AZURE_SEARCH_KEY),
    );
  }

  return client;
}

/**
 * Escapes a value for use inside an OData string literal. Single quotes are
 * escaped by doubling them, per the OData ABNF that Azure AI Search implements.
 *
 * Ids are already validated as UUIDs upstream, so this is defence in depth
 * rather than the only barrier against filter injection.
 */
function odataLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface SearchChunksOptions {
  /** Natural-language query, used for the keyword half of the hybrid search. */
  query: string;
  /** Embedding of `query`, used for the vector half. */
  vector: number[];
  /** Always required: scopes results to one tenant inside the search service. */
  userId: string;
  /** Optional: restrict to a single document (document chat). */
  documentId?: string;
  top?: number;
}

/**
 * Hybrid (keyword + vector) search, always filtered to the calling user.
 *
 * The filter is applied by the search service rather than by discarding
 * unauthorised hits in Node afterwards. Post-filtering was both a data-exposure
 * risk and functionally broken: kNN returns the k nearest chunks across every
 * tenant, so a user with few documents could get an empty result set even when
 * their own content matched.
 */
export async function searchChunks(options: SearchChunksOptions): Promise<ChunkHit[]> {
  const { query, vector, userId, documentId, top = 5 } = options;

  const filters = [`userId eq ${odataLiteral(userId)}`];
  if (documentId) {
    filters.push(`documentId eq ${odataLiteral(documentId)}`);
  }

  try {
    const response = await getClient().search(query, {
      filter: filters.join(' and '),
      top,
      select: ['id', 'documentId', 'userId', 'documentTitle', 'chunkIndex', 'content'],
      vectorSearchOptions: {
        queries: [
          {
            kind: 'vector',
            vector,
            fields: ['contentVector'],
            kNearestNeighborsCount: top,
          },
        ],
        // Apply the security filter before the vector search runs, so the kNN
        // candidate set is drawn only from this user's chunks.
        filterMode: 'preFilter',
      },
    });

    const results: ChunkHit[] = [];
    for await (const result of response.results) {
      results.push({ ...result.document, score: result.score });
    }

    return results;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    logger.error('Azure AI Search query failed', {
      status,
      error: (error as Error).message,
    });

    if (status === 404) {
      throw new AppError(
        503,
        'Search index is not provisioned yet. Run the index creation script.',
      );
    }
    throw new AppError(502, 'Search request failed');
  }
}

/** Removes every indexed chunk belonging to a document. */
export async function deleteDocumentChunks(
  documentId: string,
  userId: string,
): Promise<void> {
  const searchClient = getClient();
  const existing = await searchClient.search('*', {
    filter: `userId eq ${odataLiteral(userId)} and documentId eq ${odataLiteral(documentId)}`,
    select: ['id'],
    top: 1000,
  });

  const ids: { id: string }[] = [];
  for await (const result of existing.results) {
    ids.push({ id: result.document.id });
  }

  if (ids.length > 0) {
    await searchClient.deleteDocuments(ids as ChunkDocument[]);
  }
}
