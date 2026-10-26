
import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Database } from '../../../database/database.types.js';
import { DATABASE } from '../../../database/database.provider.js';
import type { Producer } from 'kafkajs';
import { KAFKA_PRODUCER } from '../../kafka/kafka.constants.js';
import { and, eq, sql } from 'drizzle-orm';
import { ClaimedOutboxEvent } from './outbox.types.js';
import { outboxEvents } from '../../../database/schema/outbox-events.schema.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly workerId: string;
  private readonly batchSize = 100;
  private readonly leaseDurationMs = 60_000;
  private readonly logger = new Logger(OutboxPublisher.name);
private pollTimer: ReturnType<typeof setInterval> | undefined;
private polling = false;
private stopping = false;
private readonly pollIntervalMs = 1_000;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KAFKA_PRODUCER) private readonly producer: Producer,
    private readonly configService: ConfigService,
  ) {
    this.workerId =
      `${this.configService.get<string>('HOSTNAME') ?? 'pocketledger'}-${process.pid}`;
  }
    
private async claimBatch(): Promise<ClaimedOutboxEvent[]> {
  return this.db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE attempts < max_attempts
          AND (
            (status = 'pending' AND available_at <= NOW())
            OR
            (status = 'processing' AND lease_expires_at <= NOW())
          )
        ORDER BY available_at ASC, created_at ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS event
      SET
        status = 'processing',
        attempts = event.attempts + 1,
        processing_at = NOW(),
        locked_by = ${this.workerId},
        lease_expires_at =
          NOW() + (${this.leaseDurationMs} * INTERVAL '1 millisecond'),
        updated_at = NOW()
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.*;
    `);

    return result.rows as unknown as ClaimedOutboxEvent[];
  });
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

private async markPublished(eventId: string): Promise<boolean> {
  const rows = await this.db
    .update(outboxEvents)
    .set({
      status: 'published',
      publishedAt: new Date(),
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboxEvents.id, eventId),
        eq(outboxEvents.status, 'processing'),
        eq(outboxEvents.lockedBy, this.workerId),
      ),
    )
    .returning({ id: outboxEvents.id });

  return rows.length > 0;
}
     
private async markFailed(
  eventId: string,
  attempts: number,
  error: unknown,
): Promise<boolean> {
  const maxAttempts = 10;
  const shouldDeadLetter = attempts >= maxAttempts;

  const backoffMs = Math.min(
    1_000 * 2 ** Math.max(attempts - 1, 0),
    5 * 60 * 1_000,
  );

  const message =
    error instanceof Error
      ? error.message
      : 'Unknown Kafka publishing error';

  const rows = await this.db
    .update(outboxEvents)
    .set({
      status: shouldDeadLetter ? 'dead_lettered' : 'pending',
      availableAt: new Date(Date.now() + backoffMs),
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: message.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboxEvents.id, eventId),
        eq(outboxEvents.status, 'processing'),
        eq(outboxEvents.lockedBy, this.workerId),
      ),
    )
    .returning({ id: outboxEvents.id });

  return rows.length > 0;
}


async onModuleInit(): Promise<void> {
  await this.pollOnce();

  this.pollTimer = setInterval(() => {
    void this.pollOnce();
  }, this.pollIntervalMs);
}

async onApplicationShutdown(): Promise<void> {
  this.stopping = true;

  if (this.pollTimer) {
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }
}

private async pollOnce(): Promise<void> {
  if (this.polling || this.stopping) {
    return;
  }

  this.polling = true;

  try {
    const events = await this.claimBatch();

    for (const event of events) {
      if (this.stopping) {
        break;
      }

      try {
        await this.publishEvent(event);
        const updated = await this.markPublished(event.id);

        if (!updated) {
          this.logger.warn(
            `Lost ownership while marking event ${event.id} as published`,
          );
        }
      } catch (error) {
        const updated = await this.markFailed(
          event.id,
          event.attempts,
          error,
        );

        if (!updated) {
          this.logger.warn(
            `Lost ownership while handling failure for event ${event.id}`,
          );
        }

        this.logger.error(
          `Failed to publish outbox event ${event.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  } catch (error) {
    this.logger.error(
      'Outbox polling failed',
      error instanceof Error ? error.stack : String(error),
    );
  } finally {
    this.polling = false;
  }
}

}
