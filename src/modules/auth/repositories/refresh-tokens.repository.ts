import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
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

  async revokeAndReplace(
    id: string,
    replacedByTokenId: string,
    tx: DatabaseTransaction,
  ): Promise<boolean> {
    const revoked = await tx
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        replacedByTokenId,
      })
      .where(
        and(
          eq(refreshTokens.id, id),
          isNull(refreshTokens.revokedAt),
        ),
      )
      .returning({ id: refreshTokens.id });

    return revoked.length > 0;
  }

  async revokeAllForSession(
    sessionId: string,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
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
      .set({ revokedAt: new Date() })
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
          lt(refreshTokens.expiresAt, now),
          and(
            sql`${refreshTokens.revokedAt} IS NOT NULL`,
            lt(refreshTokens.revokedAt, revokedBefore),
          ),
        ),
      )
      .returning({ id: refreshTokens.id });

    return deleted.length;
  }
}
