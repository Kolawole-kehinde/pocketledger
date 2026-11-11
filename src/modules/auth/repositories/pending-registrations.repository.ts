import { Inject, Injectable } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  pendingRegistrations,
  type PendingRegistration,
} from '../../../infrastructure/database/schema/pending-registrations.schema.js';

@Injectable()
export class PendingRegistrationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async upsert(
    email: string,
    expiresAt: Date,
    tx: DatabaseTransaction,
  ): Promise<PendingRegistration> {
    const now = new Date();

    const [registration] = await tx
      .insert(pendingRegistrations)
      .values({
        email,
        expiresAt,
        emailVerifiedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pendingRegistrations.email,
        set: {
          expiresAt,
          emailVerifiedAt: null,
          updatedAt: now,
        },
      })
      .returning();

    return registration;
  }

  async findByEmail(
    email: string,
    tx?: DatabaseTransaction,
    forUpdate = false,
  ): Promise<PendingRegistration | null> {
    const query = this.executor(tx)
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.email, email))
      .limit(1);

    const [registration] = forUpdate
      ? await query.for('update')
      : await query;

    return registration ?? null;
  }

  async findById(
    id: string,
    tx?: DatabaseTransaction,
    forUpdate = false,
  ): Promise<PendingRegistration | null> {
    const query = this.executor(tx)
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.id, id))
      .limit(1);

    const [registration] = forUpdate
      ? await query.for('update')
      : await query;

    return registration ?? null;
  }

  async markEmailVerified(
    id: string,
    expiresAt: Date,
    tx: DatabaseTransaction,
  ): Promise<PendingRegistration | null> {
    const [registration] = await tx
      .update(pendingRegistrations)
      .set({
        emailVerifiedAt: new Date(),
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(pendingRegistrations.id, id))
      .returning();

    return registration ?? null;
  }

  async deleteById(
    id: string,
    tx: DatabaseTransaction,
  ): Promise<void> {
    await tx
      .delete(pendingRegistrations)
      .where(eq(pendingRegistrations.id, id));
  }

  async deleteExpired(
    now: Date,
    tx: DatabaseTransaction,
  ): Promise<number> {
    const deleted = await tx
      .delete(pendingRegistrations)
      .where(lt(pendingRegistrations.expiresAt, now))
      .returning({ id: pendingRegistrations.id });

    return deleted.length;
  }
}
