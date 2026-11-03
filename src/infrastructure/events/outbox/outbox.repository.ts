import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../../../database/database.provider.js';
import type { Database } from '../../../database/database.types.js';
import { outboxEvents } from '../../../database/schema/outbox-events.schema.js';
import type {
  ClaimedOutboxEvent,
  EventClaim,
  OutboxEventInput,
  OutboxTransaction,
} from './outbox.types.js';
import { ClaimedOutboxEventRowsSchema } from './outbox-row.schema.js';

@Injectable()
export class OutboxRepository {
  private readonly batchSize = 100;
  private readonly leaseDurationMs = 60_000;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async enqueue(tx: OutboxTransaction, event: OutboxEventInput) {
    const [createdEvent] = await tx
      .insert(outboxEvents)
      .values({
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        correlationId: event.correlationId,
        schemaVersion: event.schemaVersion ?? 1,
      })
      .returning();

    return createdEvent;
  }

  async enqueueMany(tx: OutboxTransaction, events: OutboxEventInput[]) {
    if (events.length === 0) {
      return [];
    }

    return tx
      .insert(outboxEvents)
      .values(
        events.map((event) => ({
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          correlationId: event.correlationId,
          schemaVersion: event.schemaVersion ?? 1,
        })),
      )
      .returning();
  }

  async claimBatch(workerId: string): Promise<ClaimedOutboxEvent[]> {
    return this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        WITH candidates AS (
          SELECT candidate.id
          FROM outbox_events AS candidate
          WHERE candidate.attempts < candidate.max_attempts
            AND (
              (
                candidate.status = 'pending'
                AND candidate.available_at <= NOW()
              )
              OR (
                candidate.status = 'processing'
                AND candidate.lease_expires_at <= NOW()
              )
            )
          AND NOT EXISTS (
  SELECT 1
  FROM outbox_events AS older
  WHERE older.aggregate_type = candidate.aggregate_type
    AND older.aggregate_id = candidate.aggregate_id
    AND (older.created_at, older.id)
        < (candidate.created_at, candidate.id)
    AND older.status IN (
      'pending',
      'processing',
      'dead_lettered'
    )
)
          ORDER BY candidate.created_at ASC, candidate.id ASC
          LIMIT ${this.batchSize}
          FOR UPDATE OF candidate SKIP LOCKED
        )
        UPDATE outbox_events AS event
        SET
          status = 'processing',
          attempts = event.attempts + 1,
          processing_at = NOW(),
          locked_by = ${workerId},
          claim_token = gen_random_uuid(),
          lease_expires_at =
            NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond'),
          updated_at = NOW()
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.*;
      `);

      
const validatedRows = ClaimedOutboxEventRowsSchema.parse(result.rows);
return validatedRows.map((event) => ({
  id: event.id,
  eventType: event.event_type,
  schemaVersion: event.schema_version,
  aggregateType: event.aggregate_type,
  aggregateId: event.aggregate_id,
  payload: event.payload,
  occurredAt: event.occurred_at,
  claimToken: event.claim_token,
  correlationId: event.correlation_id,
  attempts: event.attempts,
  maxAttempts: event.max_attempts,
}));

    });
  };

  async renewLeases(
    workerId: string,
    claims: EventClaim[],
    leaseDurationMs: number,
  ): Promise<void> {
    if (claims.length === 0) return;

    const claimValues = sql.join(
      claims.map(
        (claim) => sql`(${claim.id}::uuid, ${claim.claimToken}::uuid)`,
      ),
      sql`, `,
    );

    await this.db.execute(sql`
  UPDATE outbox_events AS event
  SET
    lease_expires_at =
      NOW() + (${leaseDurationMs} * INTERVAL '1 millisecond'),
    updated_at = NOW()
  FROM (VALUES ${claimValues}) AS claimed(id, claim_token)
  WHERE event.id = claimed.id
    AND event.claim_token = claimed.claim_token
    AND event.status = 'processing'
    AND event.locked_by = ${workerId};
`);
  }

  async markPublished(
    eventId: string,
    workerId: string,
    claimToken: string,
  ): Promise<boolean> {
    const rows = await this.db
      .update(outboxEvents)
      .set({
        status: 'published',
        publishedAt: new Date(),
        processingAt: null,
        claimToken: null,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(outboxEvents.id, eventId),
          eq(outboxEvents.status, 'processing'),
          eq(outboxEvents.lockedBy, workerId),
          eq(outboxEvents.claimToken, claimToken),
        ),
      )
      .returning({ id: outboxEvents.id });

    return rows.length > 0;
  }

  async markFailed(
    eventId: string,
    workerId: string,
    attempts: number,
    claimToken: string,
    maxAttempts: number,
    error: unknown,
  ): Promise<boolean> {
    const shouldDeadLetter = attempts >= maxAttempts;

    const backoffMs = Math.min(
      1_000 * 2 ** Math.max(attempts - 1, 0),
      5 * 60 * 1_000,
    );

    const message =
      error instanceof Error ? error.message : 'Unknown Kafka publishing error';

    const rows = await this.db
      .update(outboxEvents)
      .set({
        status: shouldDeadLetter ? 'dead_lettered' : 'pending',
        availableAt: new Date(Date.now() + backoffMs),
        processingAt: null,
        claimToken: null,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: message.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(outboxEvents.id, eventId),
          eq(outboxEvents.status, 'processing'),
          eq(outboxEvents.lockedBy, workerId),
          eq(outboxEvents.claimToken, claimToken),
        ),
      )
      .returning({ id: outboxEvents.id });

    return rows.length > 0;
  }

  async deadLetterExhaustedEvents(): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({
        status: 'dead_lettered',
        processingAt: null,
        lockedBy: null,
        claimToken: null,
        leaseExpiresAt: null,
        lastError:
          'Processing lease expired after maximum attempts were exhausted',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(outboxEvents.status, 'processing'),
          sql`${outboxEvents.leaseExpiresAt} <= NOW()`,
          sql`${outboxEvents.attempts} >= ${outboxEvents.maxAttempts}`,
        ),
      );
  }

  async releaseUnprocessedEvents(
    workerId: string,
    events: ClaimedOutboxEvent[],
    startIndex: number,
  ): Promise<void> {
    const remainingEvents = events.slice(startIndex);

    if (remainingEvents.length === 0) return;

    const claimValues = sql.join(
      remainingEvents.map(
        (event) => sql`(${event.id}::uuid, ${event.claimToken}::uuid)`,
      ),
      sql`, `,
    );

    await this.db.execute(sql`
  UPDATE outbox_events AS event
  SET
    status = 'pending',
    processing_at = NULL,
    claim_token = NULL,
    locked_by = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  FROM (VALUES ${claimValues}) AS claimed(id, claim_token)
  WHERE event.id = claimed.id
    AND event.claim_token = claimed.claim_token
    AND event.status = 'processing'
    AND event.locked_by = ${workerId};
`);
  }
}
