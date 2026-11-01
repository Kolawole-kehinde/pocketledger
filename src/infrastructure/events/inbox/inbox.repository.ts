import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  ClaimedInboxEvent,
  ClaimInboxEventInput,
  InboxTransaction,
  RecordEventResult,
  RecordInboxEventInput,
} from './inbox.types.js';
import type { inboxEvents } from '../../../database/schema/inbox-events.schema.js';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../../../database/database.types.js';

const MAX_LOOKUP_ATTEMPTS = 3;

@Injectable()
export class InboxRepository {
    private readonly batchSize = 100;
    private readonly leastDuration = 60_00;
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
      lease_expires_at = NOW() + (${input.leaseDuration} * INTERVAL '1 second'),
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

  return result.rows as ClaimedInboxEvent[];
}
}
