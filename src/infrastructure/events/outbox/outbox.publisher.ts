
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Database } from '../../../database/database.types.js';
import { DATABASE } from '../../../database/database.provider.js';

import type { Producer } from 'kafkajs';
import { KAFKA_PRODUCER } from '../../kafka/kafka.constants.js';
import { sql } from 'drizzle-orm';
import { ClaimedOutboxEvent } from './outbox.types.js';

@Injectable()
export class OutboxPublisher {
  private readonly workerId: string;
  private readonly batchSize = 100;
  private readonly leaseDurationMs = 60_000;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KAFKA_PRODUCER) private readonly producer: Producer,
    private readonly configService: ConfigService,
  ) {
    this.workerId =
      `${this.configService.get<string>('HOSTNAME') ?? 'pocketledger'}-${process.pid}`;
  }
     private async claimBatch(){
        return this.db.transaction(async(tx) => {
           const result = await tx.execute(sql`
               WITH candidates AS (
                SELECT id
                FROM outbox_events
                WHERE attempts < max_attempts
                AND(
                    (status = 'pending' AND available_at <= Now())
                )
                ORDER BY available_at ASC, created_at ASC
                LIMIT ${this.batchSize}
                FOR UPDATE SKIP LOCKED
               )
               UPDATE outbox_events AS event
               SET
               status = 'processing',
               attempts = event.attempts + 1,
               processing_at = Now(),
               lockedby: ${this.workerId},
               lease_expire_at = Now() + (leaseDurationMs=${this.leaseDurationMs} * INTERVAL '1 milliseconds'),
               updated_at = Now()
               FROM  candidates
               WHERE event.id = candidates.id
               RETURNING event.*;
            `);

            return result.rows;
        })
     }

     private async publishEvent(event: ClaimedOutboxEvent): Promise<void>{
        await this.producer.send({
            topic: 'pocketledger.domain-events',
            acks: -1,
            messages: [{
                key: event.id,
                value: JSON.stringify({
                    eventId: event.id,
                    eventType: event.eventType,
                    schemaVersion: event.schemaVersion,
                    aggregateType: event.aggregateType,
                    aggregateId: event.aggregateId,
                    occuredAt: event.occurredAt.toISOString(),
                    correlationId: event.correlationId,
                    payload: event.payload
                })
            }]
        })

     }
}
