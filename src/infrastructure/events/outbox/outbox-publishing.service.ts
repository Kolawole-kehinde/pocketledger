
import { Inject, Injectable } from '@nestjs/common';
import type { Producer } from 'kafkajs';
import { KAFKA_PRODUCER } from '../../kafka/kafka.constants.js';
import type { ClaimedOutboxEvent } from './outbox.types.js';

@Injectable()
export class OutboxPublishingService {
  constructor(
    @Inject(KAFKA_PRODUCER)
    private readonly producer: Producer,
  ) {}

  async publish(event: ClaimedOutboxEvent): Promise<void> {
    await this.producer.send({
      topic: 'pocketledger.domain-events',
      acks: -1,
      messages: [
        {
          key: `${event.aggregateType}:${event.aggregateId}`,
          value: JSON.stringify({
            eventId: event.id,
            eventType: event.eventType,
            schemaVersion: event.schemaVersion,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            occurredAt: event.occurredAt.toISOString(),
            correlationId: event.correlationId,
            payload: event.payload,
          }),
        },
      ],
    });
  }
}
