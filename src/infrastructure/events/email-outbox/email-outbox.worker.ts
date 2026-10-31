
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
import type { ClaimedEmailOutboxJob } from './email-outbox.types.js';

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

  this.pollIntervalMs =  pollInterval && pollInterval > 0 ? pollInterval : 1_000;
}


async processJob( job: ClaimedEmailOutboxJob,workerId: string): Promise<void> {
  let deliveryAccepted = false;

  try {
    const payload =
      this.encryptionService.decrypt<Record<string, unknown>>(
        job.encryptedPayload,
        job.encryptionKeyVersion,
      );

    const message = this.templateRenderer.render(
      job.template,
      job.recipient,
      payload,
    );

    await this.deliveryProvider.send(message);
    deliveryAccepted = true;
  } catch (error: unknown) {
    try {
      await this.repository.markFailed(
        job.id,
        workerId,
        job.attemptCount,
        job.maxAttempts,
        error,
      );
    } catch (markError: unknown) {
      this.logger.error(
        `Failed to update email job ${job.id} after delivery error`,
        markError instanceof Error ? markError.stack : undefined,
      );
    }

    return;
  }

  if (deliveryAccepted) {
    try {
      const markedSent = await this.repository.markSent(
        job.id,
        workerId,
      );

      if (!markedSent) {
        this.logger.error(
          `Email job ${job.id} was accepted by the provider, but its lease was lost before it could be marked sent`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Email job ${job.id} was accepted by the provider, but marking it sent failed`,
        error instanceof Error ? error.stack : undefined,
      );
    }
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
  let renewalInProgress = false;

  const leaseTimer = setInterval(() => {
    if (renewalInProgress || this.stopping) {
      return;
    }

    renewalInProgress = true;

    void this.repository
      .renewLeases(
        jobs.map((job) => job.id),
        workerId,
      )
      .catch((error: unknown) => {
        this.logger.error(
          'Failed to renew email outbox leases',
          error instanceof Error ? error.stack : undefined,
        );
      })
      .finally(() => {
        renewalInProgress = false;
      });
  }, 20_000);

  try {
    while (nextIndex < jobs.length && !this.stopping) {
      const job = jobs[nextIndex];

      nextIndex += 1;
      await this.processJob(job, workerId);
    }
  } finally {
    clearInterval(leaseTimer);

    if (renewalInProgress) {
      // Wait for any in-flight renewal to finish before releasing jobs.
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (!renewalInProgress) {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };

        check();
      });
    }

    if (nextIndex < jobs.length) {
      const unprocessedJobIds = jobs
        .slice(nextIndex)
        .map((job) => job.id);

      await this.repository.releaseUnprocessedJobs(
        unprocessedJobIds,
        workerId,
      );
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
