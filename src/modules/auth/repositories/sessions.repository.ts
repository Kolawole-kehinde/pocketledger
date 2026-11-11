import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
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

  async create(data: NewSession, tx: DatabaseTransaction): Promise<Session> {
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
          gt(sessions.expiresAt, new Date()),
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
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.lastActivityAt), desc(sessions.createdAt));
  }

  async touch(
    id: string,
    lastActivityAt: Date,
    expiresAt: Date,
    tx: DatabaseTransaction,
  ): Promise<void> {
    await tx
      .update(sessions)
      .set({
        lastActivityAt,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, id));
  }

  async revoke(
    id: string,
    reason: Session['revokeReason'],
    tx: DatabaseTransaction,
  ): Promise<boolean> {
    const revoked = await tx
      .update(sessions)
      .set({
        revokedAt: new Date(),
        revokeReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessions.id, id),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });

    return revoked.length > 0;
  }

  async revokeAllForUser(
    userId: string,
    reason: Session['revokeReason'],
    tx: DatabaseTransaction,
  ): Promise<number> {
    const revoked = await tx
      .update(sessions)
      .set({
        revokedAt: new Date(),
        revokeReason: reason,
        updatedAt: new Date(),
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
    now: Date,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const revoked = await tx
      .update(sessions)
      .set({
        revokedAt: now,
        revokeReason: 'session_expired',
        updatedAt: now,
      })
      .where(
        and(
          isNull(sessions.revokedAt),
          lt(sessions.expiresAt, now),
        ),
      )
      .returning({ id: sessions.id });

    return revoked.length;
  }
}
