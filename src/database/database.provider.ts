
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConfigService } from '@nestjs/config';
import type { Database } from './database.types.js';
import * as schema from './schema/index.js';

export const DATABASE = Symbol('DATABASE');
export const DATABASE_POOL = Symbol('DATABASE_POOL');

export const databaseProviders = [
  {
    provide: DATABASE_POOL,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => {
      return new Pool({
        connectionString:
          configService.getOrThrow<string>('DATABASE_URL'),
        max: 10,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
      });
    },
  },
  {
    provide: DATABASE,
    inject: [DATABASE_POOL],
    useFactory: (pool: Pool): Database => {
      return drizzle(pool, { schema });
    },
  },
];
