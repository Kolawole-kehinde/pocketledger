import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { EmailOutboxRepository } from './email-outbox.repository.js';
import { EmailPayloadEncryptionService } from './email-payload-encryption.service.js';
import { EmailTemplateRenderer } from './email-template.renderer.js';
import {
  EMAIL_DELIVERY_PROVIDER,
  type EmailDeliveryProvider,
} from './email-delivery.provider.js';
import { ClaimedEmailOutboxJob } from './email-outbox.types.js';

@Injectable()
export class EmailOutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailOutboxWorker.name);

  private pollTimer: NodeJS.Timeout | undefined;
  private inFlightPoll: Promise<void> | undefined;
  private stopping = false;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly repository: EmailOutboxRepository,
    private readonly encryptionService: EmailPayloadEncryptionService,
    private readonly templateRenderer: EmailTemplateRenderer,
    @Inject(EMAIL_DELIVERY_PROVIDER)
    private readonly deliveryProvider: EmailDeliveryProvider,
  ) {
    const pollInterval = this.configService.get<number>(
      'EMAIL_OUTBOX_POLL_INTERVAL_MS',
    );

    this.pollIntervalMs =
      pollInterval && pollInterval > 0 ? pollInterval : 1_000;
  }

  async processJob(
    job: ClaimedEmailOutboxJob,
    workerId: string,
  ): Promise<void> {
    try {
      const payload = this.encryptionService.decrypt<Record<string, unknown>>(
        job.encryptedPayload,
        job.encryptionKeyVersion,
      );

      const message = this.templateRenderer.render(
        job.template,
        job.recipient,
        payload,
      );

      await this.deliveryProvider.send(message);
    } catch (error: unknown) {
      try {
        const markedFailed = await this.repository.markFailed(
          job.id,
          workerId,
          job.claimToken,
          job.attemptCount,
          job.maxAttempts,
          error,
        );

        if (!markedFailed) {
          this.logger.warn(
            `Could not mark email job ${job.id} as failed because its claim is no longer valid`,
          );
        }
      } catch (markError: unknown) {
        this.logger.error(
          `Failed to update email job ${job.id} after delivery error`,
          markError instanceof Error ? markError.stack : undefined,
        );
      }

      return;
    }

    try {
      const markedSent = await this.repository.markSent(
        job.id,
        workerId,
        job.claimToken,
      );

      if (!markedSent) {
        this.logger.error(
          `Email job ${job.id} was accepted by the provider, but its claim was lost before it could be marked sent`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Email job ${job.id} was accepted by the provider, but marking it sent failed`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async processBatch(): Promise<void> {
    await this.repository.recoverExhaustedJobs();
    await this.repository.recoverExpiredLeases();

    if (this.stopping) {
      return;
    }

    const workerId = randomUUID();
    const jobs = await this.repository.claimBatch(workerId);

    if (jobs.length === 0) {
      return;
    }

    let nextIndex = 0;
    let renewalUncertain = false;
    let renewalPromise: Promise<void> | undefined;

    const lostJobIds = new Set<string>();

    const leaseTimer = setInterval(() => {
      if (renewalPromise || this.stopping) {
        return;
      }

      const claims = jobs.map((job) => ({
        id: job.id,
        claimToken: job.claimToken,
      }));

      renewalPromise = (async () => {
        try {
          const renewedIds = await this.repository.renewLeases(
            claims,
            workerId,
          );

          const renewedSet = new Set(renewedIds);

          for (const job of jobs) {
            if (!renewedSet.has(job.id)) {
              lostJobIds.add(job.id);
            }
          }

          if (lostJobIds.size > 0) {
            this.logger.warn(
              `Lost email outbox lease ownership for ${lostJobIds.size} job(s)`,
            );
          }
        } catch (error: unknown) {
          renewalUncertain = true;

          this.logger.error(
            'Failed to renew email outbox leases. No additional jobs will be started in this batch.',
            error instanceof Error ? error.stack : undefined,
          );
        }
      })().finally(() => {
        renewalPromise = undefined;
      });
    }, 20_000);

    try {
      while (nextIndex < jobs.length && !this.stopping) {
        if (renewalUncertain) {
          break;
        }

        const job = jobs[nextIndex];

        if (lostJobIds.has(job.id)) {
          this.logger.warn(
            `Skipping email job ${job.id} because its lease ownership was lost`,
          );

          nextIndex++;
          continue;
        }

        nextIndex++;

        await this.processJob(job, workerId);
      }
    } finally {
      clearInterval(leaseTimer);

      // Wait for any in-flight lease renewal to finish.
      if (renewalPromise) {
        await renewalPromise;
      }

      // Release only jobs that this worker did not start processing.
      if (nextIndex < jobs.length) {
        const unprocessedClaims = jobs.slice(nextIndex).map((job) => ({
          id: job.id,
          claimToken: job.claimToken,
        }));

        try {
          await this.repository.releaseUnprocessedJobs(
            unprocessedClaims,
            workerId,
          );
        } catch (error: unknown) {
          this.logger.error(
            'Failed to release unprocessed email jobs',
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }
  }

  onModuleInit(): void {
    void this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }

    await this.inFlightPoll;
  }

  private async poll(): Promise<void> {
    if (this.stopping) {
      return;
    }

    this.inFlightPoll = this.processBatch();

    try {
      await this.inFlightPoll;
    } catch (error: unknown) {
      this.logger.error(
        'Email outbox polling failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.inFlightPoll = undefined;

      if (!this.stopping) {
        this.pollTimer = setTimeout(
          () => void this.poll(),
          this.pollIntervalMs,
        );
      }
    }
  }
}
