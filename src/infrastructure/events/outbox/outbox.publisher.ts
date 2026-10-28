
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClaimedOutboxEvent } from './outbox.types.js';
import { OutboxRepository } from './outbox.repository.js';
import { OutboxPublishingService } from './outbox-publishing.service.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly workerId: string;
  private readonly leaseDurationMs = 60_000;
  private readonly leaseRenewalIntervalMs = 20_000;
  private readonly pollIntervalMs = 1_000;
  private readonly logger = new Logger(OutboxPublisher.name);
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private inFlightPoll: Promise<void> | undefined;
  private stopping = false;



  constructor(
    private readonly configService: ConfigService,
    private readonly outboxRepository: OutboxRepository,
    private readonly outboxPublishingService: OutboxPublishingService,
  ) {
    this.workerId = `${
      this.configService.get<string>('HOSTNAME') ?? 'pocketledger'
    }-${process.pid}`;
  }

  async onModuleInit(): Promise<void> {
    await this.runPoll();

    if (this.stopping) {
      return;
    }

    this.pollTimer = setInterval(() => {
      if (this.stopping || this.inFlightPoll) {
        return;
      }

      void this.runPoll();
    }, this.pollIntervalMs);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    await this.inFlightPoll;
  }

  private async runPoll(): Promise<void> {
    const poll = this.pollOnce();
    this.inFlightPoll = poll;

    try {
      await poll;
    } finally {
      if (this.inFlightPoll === poll) {
        this.inFlightPoll = undefined;
      }
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.stopping) {
      return;
    }

    try {
      await this.outboxRepository.deadLetterExhaustedEvents();

      if (this.stopping) {
        return;
      }

      const events = await this.outboxRepository.claimBatch(this.workerId);

      if (events.length === 0) {
        return;
      }

      await this.processBatch(events);
    } catch (error) {
      this.logger.error(
        'Outbox polling failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async processBatch(
    events: ClaimedOutboxEvent[],
  ): Promise<void> {
    let nextIndex = 0;
    let renewalInProgress: Promise<void> | undefined;

    const eventIds = events.map((event) => event.id);

    const leaseTimer = setInterval(() => {
      if (renewalInProgress) {
        return;
      }

      renewalInProgress = this.outboxRepository
        .renewLeases(
          this.workerId,
          eventIds,
          this.leaseDurationMs,
        )
        .catch((error: unknown) => {
          this.logger.error(
            'Failed to renew outbox event leases',
            error instanceof Error ? error.stack : String(error),
          );
        })
        .finally(() => {
          renewalInProgress = undefined;
        });
    }, this.leaseRenewalIntervalMs);

    try {
      while (nextIndex < events.length) {
        if (this.stopping) {
          break;
        }

        const event = events[nextIndex];
        nextIndex++;

        await this.processEvent(event);
      }
    } finally {
      clearInterval(leaseTimer);

      if (renewalInProgress) {
        await renewalInProgress;
      }

      if (nextIndex < events.length) {
        try {
          await this.outboxRepository.releaseUnprocessedEvents(
            this.workerId,
            events,
            nextIndex,
          );
        } catch (error) {
          this.logger.error(
            'Failed to release unprocessed outbox events',
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
  }

  private async processEvent(
    event: ClaimedOutboxEvent,
  ): Promise<void> {
    try {
      await this.outboxPublishingService.publish(event);
    } catch (error) {
      try {
        const updated = await this.outboxRepository.markFailed(
          event.id,
          this.workerId,
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

      return;
    }

    try {
      const updated = await this.outboxRepository.markPublished(
        event.id,
        this.workerId,
      );

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
}
