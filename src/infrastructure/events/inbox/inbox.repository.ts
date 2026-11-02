import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import type {
  ClaimedInboxEvent,
  ClaimInboxEventInput,
  EventStatus,
  GetEventsByStatusResult,
  InboxTransaction,
  RecordEventResult,
  RecordInboxEventInput,
} from './inbox.types.js';

import {
  InboxEvent,
  inboxEvents,
} from '../../../database/schema/inbox-events.schema.js';

import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../database/database.types.js';

const MAX_LOOKUP_ATTEMPTS = 3;

@Injectable()
export class InboxRepository {
  private readonly batchSize = 100;
  private readonly leaseDurationMs = 60_000;

  constructor(@Inject('DATABASE') private readonly db: Database) {}

  async recordEvent(
    event: RecordInboxEventInput,
    tx: InboxTransaction,
  ): Promise<RecordEventResult> {
    const occurredAtDate = new Date(event.occurredAt);

    if (Number.isNaN(occurredAtDate.getTime())) {
      throw new Error('Invalid event occurredAt timestamp');
    }

    for (let attempt = 1; attempt <= MAX_LOOKUP_ATTEMPTS; attempt++) {
      const [insertedRow] = await tx
        .insert(inboxEvents)
        .values({
          eventId: event.eventId,
          consumerName: event.consumerName,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          schemaVersion: event.schemaVersion,
          payload: event.payload,
          correlationId: event.correlationId,
          occurredAt: occurredAtDate,
        })
        .onConflictDoNothing({
          target: [inboxEvents.consumerName, inboxEvents.eventId],
        })
        .returning({
          eventId: inboxEvents.eventId,
        });

      if (insertedRow) {
        return {
          type: 'created',
          eventId: insertedRow.eventId,
        };
      }

      const [existingRow] = await tx
        .select({
          eventId: inboxEvents.eventId,
          status: inboxEvents.status,
        })
        .from(inboxEvents)
        .where(
          and(
            eq(inboxEvents.consumerName, event.consumerName),
            eq(inboxEvents.eventId, event.eventId),
          ),
        )
        .limit(1);

      if (existingRow) {
        return {
          type: 'already_exists',
          eventId: existingRow.eventId,
          existingStatus: existingRow.status,
        };
      }
    }

    throw new InternalServerErrorException(
      `Unable to resolve inbox event persistence state after ${MAX_LOOKUP_ATTEMPTS} attempts`,
    );
  }

  async claimEvents(
    input: ClaimInboxEventInput,
    tx: InboxTransaction,
  ): Promise<ClaimedInboxEvent[]> {
    const result = await tx.execute(sql`
      WITH candidates AS (
        SELECT candidate.id
        FROM inbox_events AS candidate
        WHERE candidate.consumer_name = ${input.consumerName}
          AND candidate.attempts < candidate.max_attempts
          AND (
            candidate.status = 'received'
            OR (
              candidate.status = 'failed'
              AND candidate.available_at <= NOW()
            )
            OR (
              candidate.status = 'processing'
              AND candidate.lease_expires_at <= NOW()
            )
          )
        ORDER BY candidate.available_at ASC, candidate.created_at ASC
        LIMIT ${input.batchSize}
        FOR UPDATE OF candidate SKIP LOCKED
      )
      UPDATE inbox_events AS inbox
      SET
        status = 'processing',
        locked_by = ${input.workerId},
        claim_token = gen_random_uuid(),
        processing_at = NOW(),
        lease_expires_at = NOW() + (
          ${input.leaseDuration} * INTERVAL '1 second'
        ),
        attempts = inbox.attempts + 1,
        updated_at = NOW()
      FROM candidates
      WHERE inbox.id = candidates.id
      RETURNING
        inbox.id,
        inbox.event_id,
        inbox.consumer_name,
        inbox.event_type,
        inbox.aggregate_type,
        inbox.aggregate_id,
        inbox.schema_version,
        inbox.payload,
        inbox.correlation_id,
        inbox.occurred_at,
        inbox.claim_token,
        inbox.locked_by,
        inbox.lease_expires_at,
        inbox.attempts,
        inbox.max_attempts
    `);

    return result.rows.map((row) => ({
      id: String(row.id),
      eventId: String(row.eventId),
      consumerName: String(row.consumerName),
      eventType: String(row.eventType),
      aggregateType: String(row.aggregateType),
      aggregateId: String(row.aggregateId),
      schemaVersion: Number(row.schemaVersion),
      payload: row.payload as Record<string, unknown>,
      correlationId:
        row.correlationId == null ? null : String(row.correlationId),
      occurredAt: new Date(String(row.occurredAt)),
      claimToken: String(row.claimToken),
      lockedBy: String(row.lockedBy),
      leaseExpiresAt: new Date(String(row.leaseExpiresAt)),
      attempts: Number(row.attempts),
      maxAttempts: Number(row.maxAttempts),
    }));
  }

  async markProcessed(
    eventId: string,
    claimToken: string,
    tx: InboxTransaction,
  ): Promise<boolean> {
    const [updateRow] = await tx
      .update(inboxEvents)
      .set({
        status: 'processed',
        processedAt: new Date(),
        lockedBy: null,
        claimToken: null,
        leaseExpiresAt: null,
        processingAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inboxEvents.id, eventId),
          eq(inboxEvents.claimToken, claimToken),
          eq(inboxEvents.status, 'processing'),
        ),
      )
      .returning({ id: inboxEvents.id });

    return Boolean(updateRow);
  }

  async markFailed(
    eventId: string,
    claimToken: string,
    failureReason: string,
    tx: InboxTransaction,
  ): Promise<boolean> {
    const [updateRow] = await tx
      .update(inboxEvents)
      .set({
        status: sql<EventStatus>`
          CASE
            WHEN ${inboxEvents.attempts} >= ${inboxEvents.maxAttempts}
              THEN 'dead_lettered'::inbox_event_status
            ELSE 'failed'::inbox_event_status
          END
        `,

        failureReason: failureReason.slice(0, 1000),

        availableAt: sql<Date>`
          CASE
            WHEN ${inboxEvents.attempts} >= ${inboxEvents.maxAttempts}
              THEN ${inboxEvents.availableAt}
            ELSE
              NOW() + (
                LEAST(
                  1000 * POWER(
                    2,
                    GREATEST(${inboxEvents.attempts} - 1, 0)
                  ),
                  300000
                ) * INTERVAL '1 millisecond'
              )
          END
        `,

        lockedBy: null,
        claimToken: null,
        leaseExpiresAt: null,
        processingAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inboxEvents.id, eventId),
          eq(inboxEvents.claimToken, claimToken),
          eq(inboxEvents.status, 'processing'),
        ),
      )
      .returning({ id: inboxEvents.id });

    return updateRow !== undefined;
  }

  async recoverExpiredClaims(
    tx: InboxTransaction,
    batchSize = this.batchSize,
  ): Promise<number> {
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new RangeError('batchSize must be a positive integer');
    }

    const result = await tx.execute(sql`
      WITH expired_claims AS (
        SELECT candidate.id
        FROM inbox_events AS candidate
        WHERE candidate.status = 'processing'
          AND candidate.lease_expires_at <= NOW()
        ORDER BY candidate.lease_expires_at ASC
        LIMIT ${batchSize}
        FOR UPDATE OF candidate SKIP LOCKED
      )
      UPDATE inbox_events AS inbox
      SET
        status = CASE
          WHEN inbox.attempts >= inbox.max_attempts
            THEN 'dead_lettered'::inbox_event_status
          ELSE 'failed'::inbox_event_status
        END,
        available_at = CASE
          WHEN inbox.attempts >= inbox.max_attempts
            THEN inbox.available_at
          ELSE
            NOW() + (
              LEAST(
                1000 * POWER(
                  2,
                  GREATEST(inbox.attempts - 1, 0)
                ),
                300000
              ) * INTERVAL '1 millisecond'
            )
        END,
        failure_reason = 'Processing lease expired',
        locked_by = NULL,
        claim_token = NULL,
        lease_expires_at = NULL,
        processing_at = NULL,
        updated_at = NOW()
      FROM expired_claims
      WHERE inbox.id = expired_claims.id
      RETURNING inbox.id;
    `);

    return result.rows.length;
  }

  async getEventById(
    eventId: string,
    tx: InboxTransaction,
  ): Promise<InboxEvent | null> {
    const [event] = await tx
      .select()
      .from(inboxEvents)
      .where(eq(inboxEvents.id, eventId))
      .limit(1);

    return event ?? null;
  }

  async getEventsByStatus(
    status: EventStatus,
    tx: InboxTransaction,
    offset = 0,
    limit = 20,
  ): Promise<GetEventsByStatusResult> {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError('offset must be a non-negative integer');
    }

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError('limit must be a positive integer');
    }

    const [events, countResult] = await Promise.all([
      tx
        .select()
        .from(inboxEvents)
        .where(eq(inboxEvents.status, status))
        .orderBy(desc(inboxEvents.createdAt))
        .limit(limit)
        .offset(offset),

      tx
        .select({ total: count() })
        .from(inboxEvents)
        .where(eq(inboxEvents.status, status)),
    ]);

    return {
      events,
      total: Number(countResult[0]?.total ?? 0),
    };
  }
}
