import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const secret = (name: string) =>
  z
    .string()
    .min(32, `${name} must be at least 32 characters long`);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  SWAGGER_ENABLED: booleanFromString.optional(),
  SWAGGER_PATH: z.string().min(1).default('docs'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  KAFKA_BROKERS: z
    .string()
    .default('localhost:9094')
    .refine(
      (value) =>
        value.split(',').every((broker) => broker.trim().length > 0),
      'KAFKA_BROKERS must contain valid, non-empty broker addresses',
    ),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  JWT_REGISTRATION_SECRET: secret('JWT_REGISTRATION_SECRET'),

  JWT_ISSUER: z.string().min(1).default('pocketledger'),
  JWT_AUDIENCE: z.string().min(1).default('pocketledger-api'),
  JWT_REGISTRATION_AUDIENCE: z
    .string()
    .min(1)
    .default('pocketledger-registration'),

  JWT_ACCESS_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  JWT_REGISTRATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),

  OTP_HASH_SECRET: secret('OTP_HASH_SECRET'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(5 * 60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(60),

  REGISTRATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60),

  REFRESH_TOKEN_HASH_SECRET: secret('REFRESH_TOKEN_HASH_SECRET'),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60),

  AUTH_COOKIE_NAME: z.string().min(1).default('pocketledger_refresh'),
  AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_COOKIE_SECURE: booleanFromString.optional(),

  AUTH_CLEANUP_ENABLED: booleanFromString
    .optional()
    .transform((value) => value ?? true),
  AUTH_CLEANUP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60 * 1000),

  CACHE_MAX_ENTRIES: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
  PERMISSION_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60),

  EMAIL_PAYLOAD_ENCRYPTION_KEYS: z
    .string()
    .min(1, 'EMAIL_PAYLOAD_ENCRYPTION_KEYS is required'),
  EMAIL_PAYLOAD_ENCRYPTION_ACTIVE_VERSION: z
    .string()
    .min(1, 'EMAIL_PAYLOAD_ENCRYPTION_ACTIVE_VERSION is required'),

  EMAIL_DELIVERY_DRIVER: z.enum(['smtp', 'brevo']).default('smtp'),
  EMAIL_OUTBOX_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),

  BREVO_API_KEY: z.string().min(1).optional(),
  BREVO_SENDER_EMAIL: z.string().min(1).optional(),
  BREVO_SENDER_NAME: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;
