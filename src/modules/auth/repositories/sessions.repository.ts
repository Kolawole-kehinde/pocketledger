
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gt,
  isNull,
  sql,
} from 'drizzle-orm';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  sessions,
  type NewSession,
  type Session,
} from '../../../infrastructure/database/schema/sessions.schema.js';
import {
  users,
  type User,
} from '../../../infrastructure/database/schema/users.schema.js';

@Injectable()
export class SessionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async create(
    data: NewSession,
    tx: DatabaseTransaction,
  ): Promise<Session> {
    const [session] = await tx
      .insert(sessions)
      .values(data)
      .returning();

    return session;
  }

  async findById(
    id: string,
    tx?: DatabaseTransaction,
    forUpdate = false,
  ): Promise<Session | null> {
    const query = this.executor(tx)
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    const [session] = forUpdate
      ? await query.for('update')
      : await query;

    return session ?? null;
  }

  /**
   * Checks session and user state.
   *
   * During refresh rotation, the session row has already been locked by
   * findById(..., true). This query deliberately does not acquire another
   * session lock.
   */
  async findActiveWithUser(
    sessionId: string,
    tx?: DatabaseTransaction,
  ): Promise<{ session: Session; user: User } | null> {
    const [result] = await this.executor(tx)
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`NOW()`),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);

    return result ?? null;
  }

  async findActiveByUser(userId: string): Promise<Session[]> {
    return this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`NOW()`),
        ),
      )
      .orderBy(
        desc(sessions.lastActivityAt),
        desc(sessions.createdAt),
      );
  }

  /**
   * Updates session activity and applies a sliding session TTL using
   * PostgreSQL's clock.
   */
  async touchWithTtl(
    id: string,
    sessionTtlSeconds: number,
    tx: DatabaseTransaction,
  ): Promise<Session | null> {
    if (
      !Number.isSafeInteger(sessionTtlSeconds) ||
      sessionTtlSeconds <= 0
    ) {
      throw new Error('Session TTL must be a positive integer');
    }

    const [updated] = await tx
      .update(sessions)
      .set({
        lastActivityAt: sql<Date>`NOW()`,
        expiresAt: sql<Date>`NOW() + (${sessionTtlSeconds} * INTERVAL '1 second')`,
        updatedAt: sql<Date>`NOW()`,
      })
      .where(
        and(
          eq(sessions.id, id),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`NOW()`),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async revoke(
    id: string,
    reason: Session['revokeReason'],
    tx: DatabaseTransaction,
  ): Promise<boolean> {
    const [revoked] = await tx
      .update(sessions)
      .set({
        revokedAt: sql<Date>`NOW()`,
        revokeReason: reason,
        updatedAt: sql<Date>`NOW()`,
      })
      .where(
        and(
          eq(sessions.id, id),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });

    return Boolean(revoked);
  }

  async revokeAllForUser(
    userId: string,
    reason: Session['revokeReason'],
    tx: DatabaseTransaction,
  ): Promise<number> {
    const revoked = await tx
      .update(sessions)
      .set({
        revokedAt: sql<Date>`NOW()`,
        revokeReason: reason,
        updatedAt: sql<Date>`NOW()`,
      })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });

    return revoked.length;
  }

  async revokeExpired(
    _now: Date,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const revoked = await tx
      .update(sessions)
      .set({
        revokedAt: sql<Date>`NOW()`,
        revokeReason: 'session_expired',
        updatedAt: sql<Date>`NOW()`,
      })
      .where(
        and(
          isNull(sessions.revokedAt),
          sql`${sessions.expiresAt} <= NOW()`,
        ),
      )
      .returning({ id: sessions.id });

    return revoked.length;
  }
}
