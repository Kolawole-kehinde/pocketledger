import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  otpChallenges,
  type NewOtpChallenge,
  type OtpChallenge,
} from '../../../infrastructure/database/schema/otp-challenges.schema.js';
import type { OtpPurpose } from '../auth.types.js';

@Injectable()
export class OtpChallengesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async create(
    data: NewOtpChallenge,
    tx: DatabaseTransaction,
  ): Promise<OtpChallenge> {
    const [challenge] = await tx
      .insert(otpChallenges)
      .values(data)
      .returning();

    return challenge;
  }

  async findLatest(
    email: string,
    purpose: OtpPurpose,
    tx?: DatabaseTransaction,
    forUpdate = false,
  ): Promise<OtpChallenge | null> {
    const query = this.executor(tx)
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.email, email),
          eq(otpChallenges.purpose, purpose),
        ),
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    const [challenge] = forUpdate
      ? await query.for('update')
      : await query;

    return challenge ?? null;
  }

  async consumeActive(
    email: string,
    purpose: OtpPurpose,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const consumed = await tx
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(otpChallenges.email, email),
          eq(otpChallenges.purpose, purpose),
          isNull(otpChallenges.consumedAt),
        ),
      )
      .returning({ id: otpChallenges.id });

    return consumed.length;
  }

  async consume(
    id: string,
    tx: DatabaseTransaction,
  ): Promise<boolean> {
    const [challenge] = await tx
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(otpChallenges.id, id),
          isNull(otpChallenges.consumedAt),
        ),
      )
      .returning({ id: otpChallenges.id });

    return Boolean(challenge);
  }

  async incrementAttempts(
    id: string,
    tx: DatabaseTransaction,
  ): Promise<OtpChallenge | null> {
    const [challenge] = await tx
      .update(otpChallenges)
      .set({
        attempts: sql`${otpChallenges.attempts} + 1`,
      })
      .where(eq(otpChallenges.id, id))
      .returning();

    return challenge ?? null;
  }

  async deleteExpired(
    now: Date,
    consumedBefore: Date,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const deleted = await tx
      .delete(otpChallenges)
      .where(
        or(
          lt(otpChallenges.expiresAt, now),
          and(
            sql`${otpChallenges.consumedAt} IS NOT NULL`,
            lt(otpChallenges.consumedAt, consumedBefore),
          ),
        ),
      )
      .returning({ id: otpChallenges.id });

    return deleted.length;
  }
}
