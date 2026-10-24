import { Injectable } from '@nestjs/common';
import type { OutboxTransaction, OutboxEventInput } from './outbox.types.js';
import { outboxEvents } from '../../../database/schema/outbox-events.schema.js';

@Injectable()
export class OutboxRepository {
  async enqueue(
    tx: OutboxTransaction,
    event: OutboxEventInput,
  ) {
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

  async enqueueMany(
    tx: OutboxTransaction,
    events: OutboxEventInput[],
  ) {
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
}