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
  RenewInboxLeasesInput,
  RenewInboxLeasesResult,
} from './inbox.types.js';

import {
  InboxEvent,
  inboxEvents,
} from '../../database/schema/inbox-events.schema.js';

import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../database/database.types.js';
import { ClaimedInboxEventsRowsSchema, ClaimInboxEventsInputSchema } from './inbox-event.schema.js';

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
  const validatedInput = ClaimInboxEventsInputSchema.parse(input);

  const result = await tx.execute(sql`
    WITH candidates AS (
      SELECT candidate.id
      FROM inbox_events AS candidate
      WHERE candidate.consumer_name = ${validatedInput.consumerName}
        AND candidate.attempts < candidate.max_attempts
        AND candidate.available_at <= NOW()
        AND (
          candidate.status = 'received'
          OR candidate.status = 'failed'
        )
      ORDER BY candidate.available_at ASC, candidate.created_at ASC
      LIMIT ${validatedInput.batchSize}
      FOR UPDATE OF candidate SKIP LOCKED
    )
    UPDATE inbox_events AS inbox
    SET
      status = 'processing',
      locked_by = ${validatedInput.workerId},
      claim_token = gen_random_uuid(),
      processing_at = NOW(),
      lease_expires_at = NOW() + (
        ${validatedInput.leaseDuration} * INTERVAL '1 second'
      ),
      attempts = inbox.attempts + 1,
      updated_at = NOW()
    FROM candidates
    WHERE inbox.id = candidates.id
    RETURNING
      inbox.id AS id,
      inbox.event_id AS "eventId",
      inbox.consumer_name AS "consumerName",
      inbox.event_type AS "eventType",
      inbox.aggregate_type AS "aggregateType",
      inbox.aggregate_id AS "aggregateId",
      inbox.schema_version AS "schemaVersion",
      inbox.payload AS payload,
      inbox.correlation_id AS "correlationId",
      inbox.occurred_at AS "occurredAt",
      inbox.claim_token AS "claimToken",
      inbox.locked_by AS "lockedBy",
      inbox.lease_expires_at AS "leaseExpiresAt",
      inbox.attempts AS attempts,
      inbox.max_attempts AS "maxAttempts"
  `);

  const validatedRows = ClaimedInboxEventsRowsSchema.parse(result.rows);

  return validatedRows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    consumerName: row.consumerName,
    eventType: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    schemaVersion: row.schemaVersion,
    payload: row.payload,
    correlationId: row.correlationId,
    occurredAt: row.occurredAt,
    claimToken: row.claimToken,
    lockedBy: row.lockedBy,
    leaseExpiresAt: row.leaseExpiresAt,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
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

 async renewLeases(
  input: RenewInboxLeasesInput,
  tx: InboxTransaction,
): Promise<RenewInboxLeasesResult> {
  if (input.claims.length === 0) {
    return [];
  }

  const ownershipConditions = input.claims.map((claim) =>
    and(
      eq(inboxEvents.eventId, claim.eventId),
      eq(inboxEvents.claimToken, claim.claimToken),
      eq(inboxEvents.lockedBy, claim.lockedBy),
    ),
  );

  const updatedRows = await tx
    .update(inboxEvents)
    .set({
      leaseExpiresAt: sql<Date>`
        NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond')
      `,
      updatedAt: sql<Date>`NOW()`,
    })
    .where(
      and(
        eq(inboxEvents.consumerName, input.consumerName),
        eq(inboxEvents.status, 'processing'),
        sql`${inboxEvents.leaseExpiresAt} > NOW()`,
        sql`(${sql.join(ownershipConditions, sql` OR `)})`,
      ),
    )
    .returning({
      eventId: inboxEvents.eventId,
    });

  return updatedRows.map((row) => row.eventId);
}
}
