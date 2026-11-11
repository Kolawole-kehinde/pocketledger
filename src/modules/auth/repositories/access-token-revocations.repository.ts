import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  accessTokenRevocations,
  type NewAccessTokenRevocation,
} from '../../../infrastructure/database/schema/access-token-revocations.schema.js';

@Injectable()
export class AccessTokenRevocationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  /**
   * Adds a token identifier to the denylist. Returns `false` when the token
   * was already revoked (the unique index makes this idempotent).
   */
  async revoke(
    data: NewAccessTokenRevocation,
    tx?: DatabaseTransaction,
  ): Promise<boolean> {
    const inserted = await this.executor(tx)
      .insert(accessTokenRevocations)
      .values(data)
      .onConflictDoNothing()
      .returning({ id: accessTokenRevocations.id });

    return inserted.length > 0;
  }

  async exists(
    jti: string,
    tx?: DatabaseTransaction,
  ): Promise<boolean> {
    const [row] = await this.executor(tx)
      .select({ id: accessTokenRevocations.id })
      .from(accessTokenRevocations)
      .where(
        and(
          eq(accessTokenRevocations.jti, jti),
          gt(accessTokenRevocations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async deleteExpired(
    now: Date,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const deleted = await tx
      .delete(accessTokenRevocations)
      .where(lt(accessTokenRevocations.expiresAt, now))
      .returning({ id: accessTokenRevocations.id });

    return deleted.length;
  }
}
