import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../../../database/database.provider.js';
import type { Database } from '../../../database/database.types.js';
import { outboxEvents } from '../../../database/schema/outbox-events.schema.js';
import type {
  ClaimedOutboxEvent,
  OutboxEventInput,
  OutboxTransaction,
} from './outbox.types.js';

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
                AND older.status IN ('pending', 'processing')
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
          lease_expires_at =
            NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond'),
          updated_at = NOW()
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.*;
      `);

      return result.rows.map((row) => {
        const event = row as Record<string, unknown>;

        return {
          id: String(event.id),
          eventType: String(event.event_type),
          schemaVersion: Number(event.schema_version),
          aggregateType: String(event.aggregate_type),
          aggregateId: String(event.aggregate_id),
          payload: event.payload as Record<string, unknown>,
          occurredAt:
            event.occurred_at instanceof Date
              ? event.occurred_at
              : new Date(String(event.occurred_at)),
          correlationId:
            event.correlation_id == null
              ? null
              : String(event.correlation_id),
          attempts: Number(event.attempts),
          maxAttempts: Number(event.max_attempts),
        };
      });
    });
  }

  async renewLeases(
  workerId: string,
  eventIds: string[],
  leaseDurationMs: number,
): Promise<void> {
  if (eventIds.length === 0) return;

  await this.db
    .update(outboxEvents)
    .set({
      leaseExpiresAt: sql`
        NOW() + (${leaseDurationMs} * INTERVAL '1 millisecond')
      `,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboxEvents.status, 'processing'),
        eq(outboxEvents.lockedBy, workerId),
        sql`${outboxEvents.id} = ANY(${eventIds}::uuid[])`,
      ),
    );
}
}