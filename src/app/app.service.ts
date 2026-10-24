
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE } from '../database/database.provider.js';
import type { Database } from '../database/database.types.js';

@Injectable()
export class AppService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async getHealth() {
    try {
      await this.db.execute(sql`SELECT 1`);

      return {
        status: 'ok',
        service: 'PocketLedger API',
        dependencies: {
          database: 'connected',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'PocketLedger API',
        dependencies: {
          database: 'disconnected',
        },
      });
    }
  }
}
