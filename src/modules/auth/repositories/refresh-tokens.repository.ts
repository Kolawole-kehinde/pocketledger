
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  refreshTokens,
  type NewRefreshToken,
  type RefreshToken,
} from '../../../infrastructure/database/schema/refresh-tokens.schema.js';
import { sessions } from '../../../infrastructure/database/schema/sessions.schema.js';

@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async create(
    data: NewRefreshToken,
    tx: DatabaseTransaction,
  ): Promise<RefreshToken> {
    const [token] = await tx
      .insert(refreshTokens)
      .values(data)
      .returning();

    return token;
  }

  async createWithTtl(
    sessionId: string,
    tokenHash: string,
    ttlSeconds: number,
    tx: DatabaseTransaction,
  ): Promise<RefreshToken> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('Refresh token TTL must be a positive integer');
    }

    const [token] = await tx
      .insert(refreshTokens)
      .values({
        sessionId,
        tokenHash,
        expiresAt: sql<Date>`NOW() + (${ttlSeconds} * INTERVAL '1 second')`,
      })
      .returning();

    return token;
  }

  async findByHash(
    tokenHash: string,
    tx?: DatabaseTransaction,
    forUpdate = false,
  ): Promise<RefreshToken | null> {
    const query = this.executor(tx)
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    const [token] = forUpdate
      ? await query.for('update')
      : await query;

    return token ?? null;
  }

  async isExpired(
    id: string,
    tx: DatabaseTransaction,
  ): Promise<boolean> {
    const [result] = await tx
      .select({
        expired: sql<boolean>`${refreshTokens.expiresAt} <= NOW()`,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1);

    // A missing token must be treated as expired/invalid.
    return result?.expired ?? true;
  }

  /**
   * Revokes the current active token.
   *
   * This must happen before inserting the replacement because the database
   * enforces one active refresh token per session.
   */
  async revoke(
    id: string,
    tx: DatabaseTransaction,
  ): Promise<boolean> {
    const [revoked] = await tx
      .update(refreshTokens)
      .set({
        revokedAt: sql<Date>`NOW()`,
      })
      .where(
        and(
          eq(refreshTokens.id, id),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .returning({ id: refreshTokens.id });

    return Boolean(revoked);
  }

  /**
   * Links a revoked token to its newly-created replacement.
   * Both operations must execute in the same transaction.
   */
  async linkReplacement(
    oldTokenId: string,
    replacementTokenId: string,
    tx: DatabaseTransaction,
  ): Promise<boolean> {
    const [updated] = await tx
      .update(refreshTokens)
      .set({
        replacedByTokenId: replacementTokenId,
      })
      .where(
        and(
          eq(refreshTokens.id, oldTokenId),
          sql`${refreshTokens.revokedAt} IS NOT NULL`,
          isNull(refreshTokens.replacedByTokenId),
        ),
      )
      .returning({ id: refreshTokens.id });

    return Boolean(updated);
  }

  async revokeAllForSession(
    sessionId: string,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const revoked = await tx
      .update(refreshTokens)
      .set({
        revokedAt: sql<Date>`NOW()`,
      })
      .where(
        and(
          eq(refreshTokens.sessionId, sessionId),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .returning({ id: refreshTokens.id });

    return revoked.length;
  }

  async revokeAllForUser(
    userId: string,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const revoked = await tx
      .update(refreshTokens)
      .set({
        revokedAt: sql<Date>`NOW()`,
      })
      .where(
        and(
          isNull(refreshTokens.revokedAt),
          inArray(
            refreshTokens.sessionId,
            tx
              .select({ id: sessions.id })
              .from(sessions)
              .where(eq(sessions.userId, userId)),
          ),
        ),
      )
      .returning({ id: refreshTokens.id });

    return revoked.length;
  }

  async deleteExpired(
  now: Date,
  revokedBefore: Date,
  tx: DatabaseTransaction,
): Promise<number> {
  const deleted = await tx
    .delete(refreshTokens)
    .where(
      or(
        // Delete expired tokens that were never revoked.
        and(
          isNull(refreshTokens.revokedAt),
          lt(refreshTokens.expiresAt, now),
        ),

        // Retain revoked-token history until its retention period expires.
        and(
          isNotNull(refreshTokens.revokedAt),
          lt(refreshTokens.revokedAt, revokedBefore),
        ),
      ),
    )
    .returning({ id: refreshTokens.id });

  return deleted.length;
}
}
