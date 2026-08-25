import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import { EmailClient } from '@azure/communication-email';
import { AzureOpenAI } from 'openai';
import { PrismaClient } from '@prisma/client';
import { settings } from './config/env';

/**
 * Lazily created, process-wide singletons.
 *
 * The previous version built every client at module scope from
 * `process.env.X || ''`. An empty connection string makes the SDK constructors
 * throw during module load, which fails the entire Functions worker rather than
 * a single invocation - and the failure surfaces as "no functions found" instead
 * of a configuration error. Building them on first use keeps failures scoped to
 * one message, where the retry and dead-letter machinery can act on them.
 *
 * Reuse also matters for cost and throughput: the Functions host keeps a warm
 * worker between invocations, so connection pools and DB sessions are shared.
 */

let prismaClient: PrismaClient | undefined;
export function getPrisma(): PrismaClient {
  // A single client for the worker: Azure SQL Basic tier allows very few
  // concurrent connections, and the host may run several invocations at once.
  prismaClient ??= new PrismaClient();
  return prismaClient;
}

let blobClient: BlobServiceClient | undefined;
export function getBlobServiceClient(): BlobServiceClient {
  blobClient ??= BlobServiceClient.fromConnectionString(settings.storageConnectionString);
  return blobClient;
}

let openAiClient: AzureOpenAI | undefined;
export function getOpenAI(): AzureOpenAI {
  openAiClient ??= new AzureOpenAI({
    endpoint: settings.openAiEndpoint,
    apiKey: settings.openAiKey,
    apiVersion: settings.openAiApiVersion,
    maxRetries: 4,
    timeout: 120_000,
  });
  return openAiClient;
}

export interface IndexedChunk {
  id: string;
  documentId: string;
  userId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  contentVector: number[];
}

let searchClient: SearchClient<IndexedChunk> | undefined;
export function getSearchClient(): SearchClient<IndexedChunk> {
  searchClient ??= new SearchClient<IndexedChunk>(
    settings.searchEndpoint,
    settings.searchIndex,
    new AzureKeyCredential(settings.searchKey),
  );
  return searchClient;
}

let emailClient: EmailClient | undefined | null;
/** Returns null when Communication Services is not configured. */
export function getEmailClient(): EmailClient | null {
  if (emailClient === undefined) {
    const connectionString = settings.communicationConnectionString;
    emailClient = connectionString ? new EmailClient(connectionString) : null;
  }
  return emailClient;
}
