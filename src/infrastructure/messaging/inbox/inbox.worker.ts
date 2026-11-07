
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { InboxRepository } from './inbox.repository.js';
import type { InboxEventHandler } from './inbox-event-handler.interface.js';
import { INBOX_EVENT_HANDLER } from './inbox-event-handler.token.js';
import type { Database } from '../../database/database.types.js';
import { INBOX_WORKER_CONFIG } from './inbox-worker-config.token.js';
import type {ClaimedInboxEvent,InboxLeaseClaim, InboxWorkerConfig} from './inbox.types.js';

@Injectable()
export class InboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxWorker.name);
  private readonly workerId = `${hostname()}-${randomUUID()}`;
  private readonly activeTasks = new Map<string, Promise<void>>();
  private readonly activeClaims = new Map<string, InboxLeaseClaim>();

  private started = false;
  private stopping = false;

  private inFlightWork?: Promise<void>;
  private heartbeatInFlight?: Promise<void>;

  private heartbeatTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private resolvePollWait?: () => void;

  constructor(
    private readonly inboxRepository: InboxRepository,
    @Inject(INBOX_EVENT_HANDLER)
    private readonly inboxHandler: InboxEventHandler,
    @Inject('DATABASE')
    private readonly db: Database,
    @Inject(INBOX_WORKER_CONFIG)
    private readonly config: InboxWorkerConfig,
  ) {}


  onModuleInit(): void {
    this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  // Starts the worker only once.
  private start(): void {
    if (this.started || this.stopping) {
      return;
    }

    this.started = true;

    this.logger.log(`Inbox worker started: ${this.workerId}`);

    this.startHeartbeat();

    this.inFlightWork = this.run().catch((error: unknown) => {
      this.logger.error(
        'Inbox worker stopped unexpectedly',
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  // Stops new work and waits for existing work to finish.
  private async stop(): Promise<void> {
    if (this.stopping) {
      await this.inFlightWork;
      return;
    }

    this.stopping = true;

    this.logger.log('Inbox worker shutdown requested');

    this.wakePoller();

    await this.inFlightWork;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    await this.heartbeatInFlight;

    this.started = false;

    this.logger.log('Inbox worker stopped');
  }

  // Main polling loop.
  private async run(): Promise<void> {
    let pollingDelay = this.config.pollingInterval;

    try {
      while (!this.stopping) {
        const availableSlots =
          this.config.concurrency - this.activeTasks.size;

        if (availableSlots > 0) {
          try {
            const events = await this.claimEvents(availableSlots);

            if (events.length > 0) {
              pollingDelay = this.config.pollingInterval;

              for (const event of events) {
                this.scheduleEvent(event);
              }

              continue;
            }
          } catch (error: unknown) {
            this.logger.error(
              'Inbox event polling failed',
              error instanceof Error ? error.stack : undefined,
            );
          }
        }

        if (this.activeTasks.size > 0) {
          await Promise.race(this.activeTasks.values());
          continue;
        }

        await this.waitForPoll(pollingDelay);

        pollingDelay = Math.min(
          pollingDelay * 2,
          this.config.maxPollingInterval,
        );
      }
    } finally {
      // Do not abandon events already being processed.
      await Promise.allSettled(this.activeTasks.values());

      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
      }

      await this.heartbeatInFlight;
    }
  }

  // Claims events using a short database transaction.
  private async claimEvents(availableSlots: number): Promise<ClaimedInboxEvent[]> {
    const batchSize = Math.min(
      this.config.batchSize,
      availableSlots,
    );

    return this.db.transaction((tx) =>
      this.inboxRepository.claimEvents({
          workerId: this.workerId,
          consumerName: this.config.consumerName,
          leaseDuration: this.config.leaseDuration,
          batchSize,
        },
        tx,
      ),
    );
  }

  // Registers claimed events and starts their processing.
  private scheduleEvent(event: ClaimedInboxEvent): void {
    this.activeClaims.set(event.id, {
      eventId: event.id,
      claimToken: event.claimToken,
      lockedBy: event.lockedBy,
    });

    const task = this.processEvent(event).finally(() => {
      this.activeTasks.delete(event.id);
      this.activeClaims.delete(event.id);
    });

    this.activeTasks.set(event.id, task);
  }

  // Processes one event and records its outcome.
  private async processEvent(event: ClaimedInboxEvent): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await this.inboxHandler.handle(event, tx);

        const markedProcessed = await this.inboxRepository.markProcessed(
            event.id,
            event.claimToken,
            tx,
          );

        if (!markedProcessed) {
          throw new Error(
            `Could not mark inbox event ${event.eventId} as processed. Ownership may have been lost.`,
          );
        }
      });

      this.logger.debug(
        `Inbox event processed: ${event.eventId}`,
      );
    } catch (error: unknown) {
      await this.recordFailure(event, error);
    }
  }

  // Records failure outside the rolled-back processing transaction.
  private async recordFailure(event: ClaimedInboxEvent, error: unknown): Promise<void> {
    const failureReason = error instanceof Error ? error.message : String(error);

    try {
      const markedFailed = await this.db.transaction((tx) =>
        this.inboxRepository.markFailed(
          event.id,
          event.claimToken,
          failureReason,
          tx,
        ),
      );

      if (!markedFailed) {
        this.logger.warn(
          `Could not record failure for ${event.eventId}. The claim may no longer belong to this worker.`,
        );

        return;
      }

      this.logger.error(
        `Inbox event failed: ${event.eventId}`,
        error instanceof Error ? error.stack : undefined,
      );
    } catch (failureError: unknown) {
      this.logger.error(
        `Failed to record inbox failure: ${event.eventId}`,
        failureError instanceof Error
          ? failureError.stack
          : undefined,
      );
    }
  }

  // Starts periodic lease renewal for currently active claims.
  private startHeartbeat(): void {
    const heartbeatInterval = Math.max(
      100,
      Math.floor(this.config.leaseDuration / 3),
    );

    this.heartbeatTimer = setInterval(() => {
      if (this.heartbeatInFlight || this.activeClaims.size === 0) {
        return;
      }

      this.heartbeatInFlight = this.renewActiveLeases().finally(() => {
        this.heartbeatInFlight = undefined;
      });
    }, heartbeatInterval);
  }

  // Renews leases belonging to this worker.
  private async renewActiveLeases(): Promise<void> {
    const claims = Array.from(this.activeClaims.values());

    if (claims.length === 0) {
      return;
    }

    try {
      const renewedIds = await this.db.transaction((tx) =>
        this.inboxRepository.renewLeases(
          {
            consumerName: this.config.consumerName,
            claims,
          },
          tx,
        ),
      );

      const renewedSet = new Set(renewedIds);

      for (const claim of claims) {
        if (!renewedSet.has(claim.eventId)) {
          this.logger.warn(
            `Lease renewal failed for inbox event ${claim.eventId}.`,
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        'Inbox lease renewal failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // Waits before polling again. Shutdown can interrupt this wait.
  private waitForPoll(delay: number): Promise<void> {
    return new Promise((resolve) => {
      this.resolvePollWait = resolve;

      this.pollTimer = setTimeout(() => {
        this.pollTimer = undefined;
        this.resolvePollWait = undefined;

        resolve();
      }, delay);
    });
  }

  // Wakes the polling loop during shutdown.
  private wakePoller(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }

    this.resolvePollWait?.();
    this.resolvePollWait = undefined;
  }
}
