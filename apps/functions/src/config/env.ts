/**
 * Environment access for the worker.
 *
 * Unlike the API, a Functions host that throws while loading a module takes the
 * whole worker down and every function in it becomes undiscoverable. So nothing
 * here runs at import time - callers read values through `requireEnv` inside a
 * handler, where a failure is attributed to a single invocation and the message
 * can be dead-lettered and retried.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required app setting: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const settings = {
  get storageConnectionString() {
    return requireEnv('AZURE_STORAGE_CONNECTION_STRING');
  },
  get storageContainer() {
    return optionalEnv('AZURE_STORAGE_CONTAINER', 'documents');
  },
  get openAiEndpoint() {
    return requireEnv('AZURE_OPENAI_ENDPOINT');
  },
  get openAiKey() {
    return requireEnv('AZURE_OPENAI_KEY');
  },
  get openAiApiVersion() {
    return optionalEnv('AZURE_OPENAI_API_VERSION', '2024-10-21');
  },
  get chatDeployment() {
    return requireEnv('AZURE_OPENAI_DEPLOYMENT_ID');
  },
  get embeddingDeployment() {
    return requireEnv('AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID');
  },
  get searchEndpoint() {
    return requireEnv('AZURE_SEARCH_ENDPOINT');
  },
  get searchKey() {
    return requireEnv('AZURE_SEARCH_KEY');
  },
  get searchIndex() {
    return optionalEnv('AZURE_SEARCH_INDEX', 'documents');
  },
  /** Email is best-effort: processing must not fail because ACS is unavailable. */
  get communicationConnectionString() {
    return optionalEnv('AZURE_COMMUNICATION_CONNECTION_STRING');
  },
  get senderEmail() {
    return optionalEnv('AZURE_COMMUNICATION_SENDER_EMAIL');
  },
  get chunkSize() {
    return Number(optionalEnv('CHUNK_SIZE', '1000'));
  },
  get chunkOverlap() {
    return Number(optionalEnv('CHUNK_OVERLAP', '200'));
  },
  /**
   * Characters of document text sent to the summary model. ~4 chars per token,
   * so 48k characters is roughly 12k tokens, comfortably inside a 128k context
   * window alongside the prompt and response.
   */
  get maxSummaryChars() {
    return Number(optionalEnv('MAX_SUMMARY_CHARS', '48000'));
  },
};
