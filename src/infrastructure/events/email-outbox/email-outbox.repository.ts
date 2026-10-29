
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import { DATABASE } from '../../../database/database.provider.js';
import type { Database } from '../../../database/database.types.js';
import { emailOutbox } from '../../../database/schema/email-outbox.schema.js';
import type { ClaimedEmailOutboxJob, EmailOutboxTransaction} from './email-outbox.types.js';

@Injectable()
export class EmailOutboxRepository {
  private readonly batchSize = 50;
  private readonly leaseDurationMs = 60_000;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async enqueue(
    tx: EmailOutboxTransaction,
    input: {
      recipient: string;
      template: (typeof emailOutbox.$inferInsert)['template'];
      encryptedPayload: string;
      encryptionKeyVersion: string;
      availableAt?: Date;
      maxAttempts?: number;
    },
  ): Promise<void> {
    await tx.insert(emailOutbox).values({
      recipient: input.recipient,
      template: input.template,
      encryptedPayload: input.encryptedPayload,
      encryptionKeyVersion: input.encryptionKeyVersion,
      availableAt: input.availableAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 5,
    });
  }

  async claimBatch(workerId: string): Promise<ClaimedEmailOutboxJob[]> {
    return this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT candidate.id
          FROM email_outbox AS candidate
          WHERE candidate.attempt_count < candidate.max_attempts
            AND (
              (
                candidate.status = 'pending'
                AND candidate.available_at <= NOW()
              )
              OR
              (
                candidate.status = 'processing'
                AND candidate.lease_expires_at <= NOW()
              )
            )
          ORDER BY candidate.available_at ASC, candidate.created_at ASC
          LIMIT ${this.batchSize}
          FOR UPDATE OF candidate SKIP LOCKED
        )
        UPDATE email_outbox AS job
        SET
          status = 'processing',
          attempt_count = job.attempt_count + 1,
          processing_at = NOW(),
          locked_by = ${workerId},
          lease_expires_at = NOW() + (
            ${this.leaseDurationMs} * INTERVAL '1 millisecond'
          ),
          updated_at = NOW()
        FROM candidates
        WHERE job.id = candidates.id
        RETURNING
          job.id,
          job.recipient,
          job.template,
          job.encrypted_payload,
          job.encryption_key_version,
          job.attempt_count,
          job.max_attempts
      `);

      return result.rows.map((row) => {
        const record = row as Record<string, unknown>;

        return {
          id: String(record.id),
          recipient: String(record.recipient),
          template: record.template as ClaimedEmailOutboxJob['template'],
          encryptedPayload: String(record.encrypted_payload),
          encryptionKeyVersion: String(record.encryption_key_version),
          attemptCount: Number(record.attempt_count),
          maxAttempts: Number(record.max_attempts),
        };
      });
    });
  }
}
