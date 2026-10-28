import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Database } from '../../../database/database.types.js';
import { DATABASE } from '../../../database/database.provider.js';
import type { Producer } from 'kafkajs';
import { KAFKA_PRODUCER } from '../../kafka/kafka.constants.js';
import { and, eq, sql } from 'drizzle-orm';
import { ClaimedOutboxEvent } from './outbox.types.js';
import { outboxEvents } from '../../../database/schema/outbox-events.schema.js';
import { OutboxRepository } from './outbox.repository.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly workerId: string;
  private readonly batchSize = 100;
  private readonly leaseDurationMs = 60_000;
  private readonly leaseRenewalIntervalMs = 20_000;
  private readonly logger = new Logger(OutboxPublisher.name);
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private polling = false;
  private stopping = false;
  private readonly pollIntervalMs = 1_000;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KAFKA_PRODUCER) private readonly producer: Producer,
    private readonly configService: ConfigService,
     private readonly outboxRepository: OutboxRepository,
  ) {
    this.workerId = `${this.configService.get<string>('HOSTNAME') ?? 'pocketledger'}-${process.pid}`;
  }
  private async publishEvent(event: ClaimedOutboxEvent): Promise<void> {
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

  private async deadLetterExhaustedEvents(): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({
        status: 'dead_lettered',
        processingAt: null,
        lockedBy: null,
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
  

  private async releaseUnprocessedEvents(
  events: ClaimedOutboxEvent[],
  startIndex: number,
): Promise<void> {
  const remainingEvents = events.slice(startIndex);

  if (remainingEvents.length === 0) {
    return;
  }

  await this.db
    .update(outboxEvents)
    .set({
      status: 'pending',
      processingAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(outboxEvents.status, 'processing'),
        eq(outboxEvents.lockedBy, this.workerId),
        sql`${outboxEvents.id} = ANY(${remainingEvents.map((event) => event.id)}::uuid[])`,
      ),
    );
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
      await this.deadLetterExhaustedEvents();
       const events = await this.outboxRepository.claimBatch(this.workerId);

      const eventIds = events.map((event) => event.id);
      let renewalInProgress = false;

      const leaseTimer = setInterval(() => {
        if (renewalInProgress || this.stopping || eventIds.length === 0) {
          return;
        }

        renewalInProgress = true;

        void this.outboxRepository
  .renewLeases(this.workerId, eventIds, this.leaseDurationMs)
          .catch((error) => {
            this.logger.error(
              'Failed to renew outbox event leases',
              error instanceof Error ? error.stack : String(error),
            );
          })
          .finally(() => {
            renewalInProgress = false;
          });
      }, this.leaseRenewalIntervalMs);

      try {
        for (const event of events) {
          if (this.stopping) {
            break;
          }

          // Phase 1: Publish to Kafka.
          try {
            await this.publishEvent(event);
          } catch (error) {
            try {
              const updated = await this.markFailed(
                event.id,
                event.attempts,
                event.maxAttempts,
                error,
              );

              if (!updated) {
                this.logger.warn(
                  `Lost ownership while handling failure for event ${event.id}`,
                );
              }
            } catch (markFailedError) {
              this.logger.error(
                `Failed to record publishing failure for event ${event.id}`,
                markFailedError instanceof Error
                  ? markFailedError.stack
                  : String(markFailedError),
              );
            }

            this.logger.error(
              `Failed to publish outbox event ${event.id}`,
              error instanceof Error ? error.stack : String(error),
            );

            continue;
          }

          // Phase 2: Kafka accepted the message; record success in PostgreSQL.
          try {
            const updated = await this.markPublished(event.id);

            if (!updated) {
              this.logger.warn(
                `Lost ownership while marking event ${event.id} as published`,
              );
            }
          } catch (error) {
            this.logger.error(
              `Kafka accepted event ${event.id}, but marking it published in PostgreSQL failed. The event may be delivered again after lease recovery.`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
      } finally {
        clearInterval(leaseTimer);
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
