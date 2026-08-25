import { AzureOpenAI } from 'openai';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Lazily constructed so the module can be imported without valid credentials
 * (useful in tests and for local UI work), and reused so the SDK keeps its
 * HTTP connections warm.
 */
let client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI {
  if (!config.AZURE_OPENAI_ENDPOINT || !config.AZURE_OPENAI_KEY) {
    throw new AppError(503, 'AI features are not configured');
  }

  if (!client) {
    client = new AzureOpenAI({
      endpoint: config.AZURE_OPENAI_ENDPOINT,
      apiKey: config.AZURE_OPENAI_KEY,
      apiVersion: config.AZURE_OPENAI_API_VERSION,
      maxRetries: 3,
      timeout: 60_000,
    });
  }

  return client;
}

function toAppError(error: unknown, operation: string): AppError {
  const status = (error as { status?: number }).status;
  const message = (error as Error).message ?? 'unknown error';

  logger.error(`Azure OpenAI ${operation} failed`, { status, error: message });

  // 429 from Azure OpenAI means the deployment's token/request quota is
  // exhausted. Passing it through lets the client back off instead of treating
  // a temporary capacity limit as a permanent failure.
  if (status === 429) {
    return new AppError(429, 'AI service is busy. Please retry in a moment.');
  }
  if (status === 400) {
    return new AppError(400, 'The AI service rejected this request');
  }
  return new AppError(502, 'AI service request failed');
}

export async function createEmbedding(input: string): Promise<number[]> {
  if (!config.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID) {
    throw new AppError(503, 'Embedding model is not configured');
  }

  try {
    const response = await getClient().embeddings.create({
      model: config.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID,
      input,
    });

    const vector = response.data[0]?.embedding;
    if (!vector) throw new Error('Embedding response contained no vector');

    return vector;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw toAppError(error, 'embeddings.create');
  }
}

export async function createChatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!config.AZURE_OPENAI_DEPLOYMENT_ID) {
    throw new AppError(503, 'Chat model is not configured');
  }

  try {
    const response = await getClient().chat.completions.create({
      model: config.AZURE_OPENAI_DEPLOYMENT_ID,
      messages,
      // Low temperature: answers must stay anchored to the retrieved context.
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 800,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw toAppError(error, 'chat.completions.create');
  }
}
