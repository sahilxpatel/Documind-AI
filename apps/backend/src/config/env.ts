import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env before anything else reads process.env. In Azure App Service the
// values arrive as real environment variables and there is no .env file, which
// dotenv handles silently.
dotenv.config();

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // App Service injects PORT. Locally we default to 4000.
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Azure SQL Basic and serverless tiers park an idle database and can take 15s+
  // to accept the first connection, so the readiness probe needs headroom.
  DB_HEALTHCHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  // 32+ chars so a weak secret cannot reach production.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Comma-separated list of browser origins allowed to call the API. Empty is a
  // valid production setting when the SPA is served from this same App Service,
  // because same-origin requests never trigger a CORS preflight.
  CORS_ORIGINS: z.string().default(''),

  // Directory of built SPA assets to serve. Set to an empty string to run the
  // API on its own (for example when the frontend is hosted separately).
  SERVE_STATIC_DIR: z.string().default('public'),

  AZURE_STORAGE_CONNECTION_STRING: z.string().default(''),
  AZURE_STORAGE_CONTAINER: z.string().default('documents'),

  AZURE_SERVICE_BUS_CONNECTION_STRING: z.string().default(''),
  AZURE_SERVICE_BUS_QUEUE: z.string().default('document-processing'),

  AZURE_OPENAI_ENDPOINT: z.string().default(''),
  AZURE_OPENAI_KEY: z.string().default(''),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-10-21'),
  AZURE_OPENAI_DEPLOYMENT_ID: z.string().default(''),
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID: z.string().default(''),

  AZURE_SEARCH_ENDPOINT: z.string().default(''),
  AZURE_SEARCH_INDEX: z.string().default('documents'),
  AZURE_SEARCH_KEY: z.string().default(''),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

/**
 * Environment variables that the API cannot usefully serve traffic without.
 * They are optional in development (so the app boots for UI work) but required
 * in production, where a missing value means a silently broken feature.
 */
const PRODUCTION_REQUIRED = [
  'AZURE_STORAGE_CONNECTION_STRING',
  'AZURE_SERVICE_BUS_CONNECTION_STRING',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_KEY',
  'AZURE_OPENAI_DEPLOYMENT_ID',
  'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID',
  'AZURE_SEARCH_ENDPOINT',
  'AZURE_SEARCH_KEY',
] as const;

function fail(messages: string[]): never {
  // Written straight to stderr: the logger itself depends on this module.
  process.stderr.write(
    `\nInvalid environment configuration:\n${messages.map((m) => `  - ${m}`).join('\n')}\n\n`,
  );
  process.exit(1);
}

function load() {
  const parsed = rawSchema.safeParse(process.env);

  if (!parsed.success) {
    fail(
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    );
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    const missing = PRODUCTION_REQUIRED.filter((key) => !env[key]);
    if (missing.length > 0) {
      fail(missing.map((key) => `${key} must be set when NODE_ENV=production`));
    }
  }

  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  // In development the SPA runs on its own Vite port, so allow it by default.
  // In production an empty list means same-origin only, which is correct when the
  // SPA ships inside this deployment.
  const resolvedCorsOrigins =
    corsOrigins.length > 0
      ? corsOrigins
      : isProduction
        ? []
        : ['http://localhost:5173', 'http://localhost:4173'];

  return {
    ...env,
    isProduction,
    isDevelopment: env.NODE_ENV === 'development',
    corsOrigins: resolvedCorsOrigins,
  };
}

export type AppConfig = ReturnType<typeof load>;

export const config: AppConfig = load();
