import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  KAFKA_BROKERS: z.string().default('localhost:9094').refine(
      (value) => value.split(',').every((broker) => broker.trim().length > 0),
      'KAFKA_BROKERS must contain valid, non-empty broker addresses',
    ),
});