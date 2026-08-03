import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}, z.boolean());

const numberFromEnv = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      return defaultValue;
    }
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }, z.number());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('financial-api-platform'),
  APP_PORT: numberFromEnv(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUSTED_HOSTS: z.string().default('localhost,127.0.0.1'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('financial-api-platform'),
  KAFKA_OUTBOX_TOPIC: z.string().default('financial.events'),
  KAFKA_DLQ_TOPIC: z.string().default('financial.events.dlq'),
  KAFKA_ENABLED: booleanFromEnv.default(true),

  TOKEN_ISSUER: z.string().url(),
  TOKEN_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL_SECONDS: numberFromEnv(300),
  REFRESH_TOKEN_TTL_SECONDS: numberFromEnv(86400),
  AUTHORIZATION_CODE_TTL_SECONDS: numberFromEnv(60),
  CLOCK_SKEW_SECONDS: numberFromEnv(30),

  JWT_ACTIVE_KID: z.string().min(1),
  JWT_PRIVATE_JWK: z.string().min(1),
  JWT_PUBLIC_JWKS: z.string().default('{"keys":[]}'),

  ENABLE_SWAGGER: booleanFromEnv.default(false),
  ENABLE_AUDIT: booleanFromEnv.default(true),
  ENABLE_PROVIDER_SANDBOX: booleanFromEnv.default(false),
  RATE_LIMIT_WINDOW_MS: numberFromEnv(60000),
  RATE_LIMIT_MAX: numberFromEnv(100),
  MTLS_REQUIRED: booleanFromEnv.default(false),

  OTEL_ENABLED: booleanFromEnv.default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  METRICS_ENABLED: booleanFromEnv.default(true),

  ENABLE_WORKERS: booleanFromEnv.default(false),
  OUTBOX_POLL_INTERVAL_MS: numberFromEnv(5000),
  CONSENT_EXPIRATION_INTERVAL_MS: numberFromEnv(60000),
  PAYMENT_RECONCILIATION_INTERVAL_MS: numberFromEnv(120000),
});

export type AppConfig = z.infer<typeof envSchema>;

export const CONFIG_KEY = 'app';

export function validateConfig(raw: Record<string, unknown>): AppConfig {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

export function configurationFactory(): Record<string, AppConfig> {
  return { [CONFIG_KEY]: validateConfig(process.env) };
}
