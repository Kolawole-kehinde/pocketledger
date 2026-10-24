import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConfigService } from '@nestjs/config';
import type { Database } from './database.types.js';
import * as schema from './schema/index.js';

export const DATABASE = Symbol('DATABASE');

export const databaseProvider = {
  provide: DATABASE,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const pool = new Pool({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });

    const db: Database = drizzle(pool, { schema });

    return { db, pool };
  },
};