
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, lt, or, sql } from 'drizzle-orm';
import { DATABASE } from '../../../database/database.provider.js';
import type { Database } from '../../../database/database.types.js';
import { emailOutbox, EmailOutboxJob } from '../../../database/schema/email-outbox.schema.js';
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

  
async markSent( jobId: string, workerId: string): Promise<boolean> {
  const result = await this.db
    .update(emailOutbox)
    .set({
      status: 'sent',
      sentAt: new Date(),
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.id, jobId),
        eq(emailOutbox.status, 'processing'),
        eq(emailOutbox.lockedBy, workerId),
      ),
    )
    .returning({ id: emailOutbox.id });

  return result.length > 0;
}

async markFailed(
  jobId: string,
  workerId: string,
  attemptCount: number,
  maxAttempts: number,
  error: unknown,
): Promise<boolean> {

  const permanentlyFailed = attemptCount >= maxAttempts;

  const backoffMs = Math.min(
    1_000 * 2 ** (attemptCount - 1),
    5 * 60 * 1_000,
  );

 const message =
  error instanceof Error
    ? error.name === 'InternalServerErrorException'
      ? 'Email payload processing failed'
      : 'Email delivery attempt failed'
    : 'Unknown email delivery error';

  const result = await this.db
    .update(emailOutbox)
    .set({
      status: permanentlyFailed ? 'failed' : 'pending',
      availableAt: permanentlyFailed
        ? new Date()
        : new Date(Date.now() + backoffMs),
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: message.slice(0, 1_000),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.id, jobId),
        eq(emailOutbox.status, 'processing'),
        eq(emailOutbox.lockedBy, workerId),
      ),
    )
    .returning({ id: emailOutbox.id });

  return result.length > 0;
}

async recoverExpiredLeases(): Promise<void> {
  await this.db
    .update(emailOutbox)
    .set({
      status: sql`
        CASE
          WHEN ${emailOutbox.attemptCount} >= ${emailOutbox.maxAttempts}
            THEN 'failed'::email_outbox_status
          ELSE 'pending'::email_outbox_status
        END
      `,
      availableAt: new Date(),
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: sql`
        CASE
          WHEN ${emailOutbox.attemptCount} >= ${emailOutbox.maxAttempts}
            THEN 'Worker lease expired after maximum attempts'
          ELSE 'Worker lease expired before delivery completed'
        END
      `,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.status, 'processing'),
        sql`${emailOutbox.leaseExpiresAt} <= NOW()`,
      ),
    );
}
async renewLeases(
  jobIds: string[],
  workerId: string,
): Promise<void> {
  if (jobIds.length === 0) {
    return;
  }

  await this.db
    .update(emailOutbox)
    .set({
      leaseExpiresAt: sql`
        NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond')
      `,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.status, 'processing'),
        eq(emailOutbox.lockedBy, workerId),
        sql`${emailOutbox.id} IN (${sql.join(
          jobIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      ),
    );
}
async releaseUnprocessedJobs(
  jobIds: string[],
  workerId: string,
): Promise<void> {
  if (jobIds.length === 0) {
    return;
  }

  await this.db
    .update(emailOutbox)
    .set({
      status: 'pending',
      availableAt: new Date(),
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.status, 'processing'),
        eq(emailOutbox.lockedBy, workerId),
        sql`${emailOutbox.id} IN (${sql.join(
          jobIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      ),
    );
}
async recoverExhaustedJobs(): Promise<void> {
  await this.db
    .update(emailOutbox)
    .set({
      status: 'failed',
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: 'Processing lease expired after maximum attempts',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.status, 'processing'),
        sql`${emailOutbox.leaseExpiresAt} <= NOW()`,
        sql`${emailOutbox.attemptCount} >= ${emailOutbox.maxAttempts}`,
      ),
    );
}

async getPendingCount(): Promise<number> {
  const [result] = await this.db
    .select({ total: count() })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'pending'));

  return result.total;
}

async getFailedCount(): Promise<number> {
  const [result] = await this.db
    .select({ total: count() })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'failed'));

  return result.total;
}
async getJobById(jobId: string): Promise<EmailOutboxJob | null> {
  const [job] = await this.db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.id, jobId))
    .limit(1);

  return job ?? null;
}
async retryFailedJob(jobId: string): Promise<boolean> {
  const result = await this.db
    .update(emailOutbox)
    .set({
      status: 'pending',
      attemptCount: 0,
      availableAt: new Date(),
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: null,
      sentAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailOutbox.id, jobId),
        eq(emailOutbox.status, 'failed'),
      ),
    )
    .returning({ id: emailOutbox.id });

  return result.length > 0;
}


}
