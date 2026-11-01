
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { DatabaseModule } from '../src/database/database.module.js';
import { DATABASE } from '../src/database/database.provider.js';
import type { Database } from '../src/database/database.types.js';
import { randomUUID } from 'node:crypto';
import type { EmailDeliveryProvider } from '../src/infrastructure/events/email-outbox/email-delivery.provider.js';
import type { ClaimedEmailOutboxJob } from '../src/infrastructure/events/email-outbox/email-outbox.types.js';
import { emailOutbox } from '../src/database/schema/email-outbox.schema.js';
import { EmailOutboxModule } from '../src/infrastructure/events/email-outbox/email-outbox.module.js';
import { EmailOutboxRepository } from '../src/infrastructure/events/email-outbox/email-outbox.repository.js';
import { EmailPayloadEncryptionService } from '../src/infrastructure/events/email-outbox/email-payload-encryption.service.js';
import { EmailOutboxWorker } from '../src/infrastructure/events/email-outbox/email-outbox.worker.js';
import { EmailTemplateRenderer } from '../src/infrastructure/events/email-outbox/email-template.renderer.js';
import { EMAIL_DELIVERY_PROVIDER } from '../src/infrastructure/events/email-outbox/email-delivery.provider.js';

describe('EmailOutboxWorker integration', () => {
  let db: Database;
  let repository: EmailOutboxRepository;
  let encryptionService: EmailPayloadEncryptionService;
  let worker: EmailOutboxWorker;
  let jobId: string;

  const recipient = process.env.TEST_EMAIL_RECIPIENT;

  beforeAll(async () => {
    if (!recipient) {
      throw new Error('TEST_EMAIL_RECIPIENT is not configured');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        DatabaseModule,
        EmailOutboxModule,
      ],
    })
      .overrideProvider(EmailOutboxWorker)
      .useFactory({
        factory: (
          configService: ConfigService,
          repository: EmailOutboxRepository,
          encryptionService: EmailPayloadEncryptionService,
          templateRenderer: EmailTemplateRenderer,
          deliveryProvider: typeof EMAIL_DELIVERY_PROVIDER extends never
            ? never
            : import('../src/infrastructure/events/email-outbox/email-delivery.provider.js').EmailDeliveryProvider,
        ) => {
          const instance = new EmailOutboxWorker(
            configService,
            repository,
            encryptionService,
            templateRenderer,
            deliveryProvider,
          );

          instance.onModuleInit = () => {};
          instance.onModuleDestroy = async () => {};

          return instance;
        },
        inject: [
          ConfigService,
          EmailOutboxRepository,
          EmailPayloadEncryptionService,
          EmailTemplateRenderer,
          EMAIL_DELIVERY_PROVIDER,
        ],
      })
      .compile();

    db = moduleRef.get<Database>(DATABASE);
    repository = moduleRef.get(EmailOutboxRepository);
    encryptionService = moduleRef.get(EmailPayloadEncryptionService);
    worker = moduleRef.get(EmailOutboxWorker);
  });

  it('should deliver an encrypted email and mark the job as sent', async () => {
    const encrypted = encryptionService.encrypt({
      otp: '482916',
      expiresInMinutes: 5,
    });

    await db.transaction(async (tx) => {
      await repository.enqueue(tx, {
        recipient: recipient!,
        template: 'registration_otp',
        encryptedPayload: encrypted.encryptedPayload,
        encryptionKeyVersion: encrypted.encryptionKeyVersion,
      });
    });

    const [job] = await db
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.recipient, recipient!),
          eq(emailOutbox.template, 'registration_otp'),
          eq(emailOutbox.encryptedPayload, encrypted.encryptedPayload),
        ),
      )
      .limit(1);

    expect(job).toBeDefined();

    jobId = job.id;

    await worker.processBatch();

    const [updatedJob] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.id, jobId));

    expect(updatedJob).toBeDefined();
    expect(updatedJob.status).toBe('sent');
    expect(updatedJob.sentAt).toBeInstanceOf(Date);
    expect(updatedJob.lockedBy).toBeNull();
    expect(updatedJob.leaseExpiresAt).toBeNull();
  });


  it('should retry a failed email delivery with exponential backoff', async () => {
  const encrypted = encryptionService.encrypt({
    otp: '123456',
    expiresInMinutes: 5,
  });

  await db.transaction(async (tx) => {
    await repository.enqueue(tx, {
      recipient: recipient!,
      template: 'registration_otp',
      encryptedPayload: encrypted.encryptedPayload,
      encryptionKeyVersion: encrypted.encryptionKeyVersion,
      maxAttempts: 5,
    });
  });

  const [job] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.encryptedPayload, encrypted.encryptedPayload))
    .limit(1);

  expect(job).toBeDefined();

  const workerId = randomUUID();

  // Simulate a job that has already been claimed for its first attempt.
  await db
    .update(emailOutbox)
    .set({
      status: 'processing',
      attemptCount: 1,
      lockedBy: workerId,
      processingAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    })
    .where(eq(emailOutbox.id, job.id));

  const claimedJob: ClaimedEmailOutboxJob = {
    id: job.id,
    recipient: job.recipient,
    template: job.template,
    encryptedPayload: job.encryptedPayload,
    encryptionKeyVersion: job.encryptionKeyVersion,
    attemptCount: 1,
    maxAttempts: 5,
  };

  const failingProvider: EmailDeliveryProvider = {
    send: async () => {
      throw new Error('Simulated provider outage');
    },
  };

  const failingWorker = new EmailOutboxWorker(
    new ConfigService(),
    repository,
    encryptionService,
    new EmailTemplateRenderer(),
    failingProvider,
  );

  const beforeFailure = Date.now();

  await failingWorker.processJob(claimedJob, workerId);

  const afterFailure = Date.now();

  const updatedJob = await repository.getJobById(job.id);

  expect(updatedJob).toBeDefined();
  expect(updatedJob!.status).toBe('pending');
  expect(updatedJob!.attemptCount).toBe(1);
  expect(updatedJob!.lockedBy).toBeNull();
  expect(updatedJob!.processingAt).toBeNull();
  expect(updatedJob!.leaseExpiresAt).toBeNull();

  // First retry uses a 1-second backoff.
  expect(updatedJob!.availableAt.getTime()).toBeGreaterThanOrEqual(
    beforeFailure + 1_000,
  );

  expect(updatedJob!.availableAt.getTime()).toBeLessThanOrEqual(
    afterFailure + 2_000,
  );

  expect(updatedJob!.lastError).toBe('Email delivery attempt failed');
});


it('should recover an expired worker lease and allow another worker to claim the job', async () => {
  const encrypted = encryptionService.encrypt({
    otp: '654321',
    expiresInMinutes: 5,
  });

  await db.transaction(async (tx) => {
    await repository.enqueue(tx, {
      recipient: recipient!,
      template: 'registration_otp',
      encryptedPayload: encrypted.encryptedPayload,
      encryptionKeyVersion: encrypted.encryptionKeyVersion,
      maxAttempts: 5,
    });
  });

  const [job] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.encryptedPayload, encrypted.encryptedPayload))
    .limit(1);

  expect(job).toBeDefined();

  // Worker A claims the job.
  const firstWorkerId = randomUUID();
  const firstBatch = await repository.claimBatch(firstWorkerId);

  const firstClaim = firstBatch.find((item) => item.id === job.id);

  expect(firstClaim).toBeDefined();
  expect(firstClaim!.attemptCount).toBe(1);

  // Simulate worker A crashing by expiring its lease.
  await db
    .update(emailOutbox)
    .set({
      leaseExpiresAt: new Date(Date.now() - 1_000),
    })
    .where(eq(emailOutbox.id, job.id));

  // Recover jobs whose worker leases have expired.
  await repository.recoverExpiredLeases();

  const recoveredJob = await repository.getJobById(job.id);

  expect(recoveredJob).toBeDefined();
  expect(recoveredJob!.status).toBe('pending');
  expect(recoveredJob!.lockedBy).toBeNull();
  expect(recoveredJob!.leaseExpiresAt).toBeNull();

  // Worker B claims the recovered job.
  const secondWorkerId = randomUUID();
  const secondBatch = await repository.claimBatch(secondWorkerId);

  const secondClaim = secondBatch.find((item) => item.id === job.id);

  expect(secondClaim).toBeDefined();
  expect(secondClaim!.attemptCount).toBe(2);

  const reclaimedJob = await repository.getJobById(job.id);

  expect(reclaimedJob!.status).toBe('processing');
  expect(reclaimedJob!.lockedBy).toBe(secondWorkerId);
});
it('should demonstrate possible duplicate delivery when marking a sent email fails', async () => {
  const encrypted = encryptionService.encrypt({
    otp: '789012',
    expiresInMinutes: 5,
  });

  await db.transaction(async (tx) => {
    await repository.enqueue(tx, {
      recipient: recipient!,
      template: 'registration_otp',
      encryptedPayload: encrypted.encryptedPayload,
      encryptionKeyVersion: encrypted.encryptionKeyVersion,
      maxAttempts: 5,
    });
  });

  const [job] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.encryptedPayload, encrypted.encryptedPayload))
    .limit(1);

  expect(job).toBeDefined();

  let deliveryCount = 0;

  const acceptingProvider: EmailDeliveryProvider = {
    send: async () => {
      deliveryCount += 1;
    },
  };

  const duplicateWorker = new EmailOutboxWorker(
    new ConfigService(),
    repository,
    encryptionService,
    new EmailTemplateRenderer(),
    acceptingProvider,
  );

  // Worker A claims and sends the email.
  const firstWorkerId = randomUUID();
  const firstBatch = await repository.claimBatch(firstWorkerId);
  const firstClaim = firstBatch.find((item) => item.id === job.id);

  expect(firstClaim).toBeDefined();

  // Simulate the database acknowledgement failing after provider acceptance.
  const markSentSpy = vi
    .spyOn(repository, 'markSent')
    .mockResolvedValueOnce(false);

  await duplicateWorker.processJob(firstClaim!, firstWorkerId);

  expect(deliveryCount).toBe(1);
  expect(markSentSpy).toHaveBeenCalledOnce();

  markSentSpy.mockRestore();

  // Simulate Worker A's lease expiring.
  await db
    .update(emailOutbox)
    .set({
      leaseExpiresAt: new Date(Date.now() - 1_000),
    })
    .where(eq(emailOutbox.id, job.id));

  await repository.recoverExpiredLeases();

  // Worker B claims and sends the same email again.
  const secondWorkerId = randomUUID();
  const secondBatch = await repository.claimBatch(secondWorkerId);
  const secondClaim = secondBatch.find((item) => item.id === job.id);

  expect(secondClaim).toBeDefined();
  expect(secondClaim!.attemptCount).toBe(2);

  await duplicateWorker.processJob(secondClaim!, secondWorkerId);

  expect(deliveryCount).toBe(2);

  const finalJob = await repository.getJobById(job.id);

  expect(finalJob).toBeDefined();
  expect(finalJob!.status).toBe('sent');
  expect(finalJob!.attemptCount).toBe(2);
  expect(finalJob!.lockedBy).toBeNull();
});


it('should permanently fail an email after reaching maximum attempts', async () => {
  const encrypted = encryptionService.encrypt({
    otp: '321654',
    expiresInMinutes: 5,
  });

  await db.transaction(async (tx) => {
    await repository.enqueue(tx, {
      recipient: recipient!,
      template: 'registration_otp',
      encryptedPayload: encrypted.encryptedPayload,
      encryptionKeyVersion: encrypted.encryptionKeyVersion,
      maxAttempts: 5,
    });
  });

  const [job] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.encryptedPayload, encrypted.encryptedPayload))
    .limit(1);

  expect(job).toBeDefined();

  const workerId = randomUUID();

  // Simulate the job being claimed for its fifth attempt.
  await db
    .update(emailOutbox)
    .set({
      status: 'processing',
      attemptCount: 5,
      lockedBy: workerId,
      processingAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    })
    .where(eq(emailOutbox.id, job.id));

  const claimedJob: ClaimedEmailOutboxJob = {
    id: job.id,
    recipient: job.recipient,
    template: job.template,
    encryptedPayload: job.encryptedPayload,
    encryptionKeyVersion: job.encryptionKeyVersion,
    attemptCount: 5,
    maxAttempts: 5,
  };

  const failingProvider: EmailDeliveryProvider = {
    send: async () => {
      throw new Error('Simulated permanent provider failure');
    },
  };

  const failingWorker = new EmailOutboxWorker(
    new ConfigService(),
    repository,
    encryptionService,
    new EmailTemplateRenderer(),
    failingProvider,
  );

  await failingWorker.processJob(claimedJob, workerId);

  const failedJob = await repository.getJobById(job.id);

  expect(failedJob).toBeDefined();
  expect(failedJob!.status).toBe('failed');
  expect(failedJob!.attemptCount).toBe(5);
  expect(failedJob!.lockedBy).toBeNull();
  expect(failedJob!.processingAt).toBeNull();
  expect(failedJob!.leaseExpiresAt).toBeNull();
  expect(failedJob!.lastError).toBe('Email delivery attempt failed');

  // A permanently failed job must not be claimed again.
  const nextBatch = await repository.claimBatch(randomUUID());

  expect(nextBatch.some((item) => item.id === job.id)).toBe(false);
});


it('should wait for in-flight delivery and release unprocessed jobs during shutdown', async () => {
  const firstEncrypted = encryptionService.encrypt({
    otp: '111111',
    expiresInMinutes: 5,
  });

  const secondEncrypted = encryptionService.encrypt({
    otp: '222222',
    expiresInMinutes: 5,
  });

  const now = Date.now();

  await db.transaction(async (tx) => {
    await repository.enqueue(tx, {
      recipient: recipient!,
      template: 'registration_otp',
      encryptedPayload: firstEncrypted.encryptedPayload,
      encryptionKeyVersion: firstEncrypted.encryptionKeyVersion,
      availableAt: new Date(now - 2_000),
    });

    await repository.enqueue(tx, {
      recipient: recipient!,
      template: 'registration_otp',
      encryptedPayload: secondEncrypted.encryptedPayload,
      encryptionKeyVersion: secondEncrypted.encryptionKeyVersion,
      availableAt: new Date(now - 1_000),
    });
  });

  const [firstJob] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.encryptedPayload, firstEncrypted.encryptedPayload));

  const [secondJob] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.encryptedPayload, secondEncrypted.encryptedPayload));

  expect(firstJob).toBeDefined();
  expect(secondJob).toBeDefined();

  let signalProviderStarted!: () => void;
  let releaseDelivery!: () => void;

  const providerStarted = new Promise<void>((resolve) => {
    signalProviderStarted = resolve;
  });

  const deliveryGate = new Promise<void>((resolve) => {
    releaseDelivery = resolve;
  });

  const controlledProvider: EmailDeliveryProvider = {
    send: async () => {
      signalProviderStarted();
      await deliveryGate;
    },
  };

  const shutdownWorker = new EmailOutboxWorker(
    new ConfigService(),
    repository,
    encryptionService,
    new EmailTemplateRenderer(),
    controlledProvider,
  );

  // Start the worker's normal polling lifecycle.
  shutdownWorker.onModuleInit();

  // Wait until the first email is actively being delivered.
  await providerStarted;

  // Begin shutdown while delivery is still in progress.
  const shutdownPromise = shutdownWorker.onModuleDestroy();

  // Allow the in-flight delivery to finish.
  releaseDelivery();

  // Shutdown must wait for the current poll to complete.
  await shutdownPromise;

  const finalFirstJob = await repository.getJobById(firstJob.id);
  const finalSecondJob = await repository.getJobById(secondJob.id);

  expect(finalFirstJob!.status).toBe('sent');
  expect(finalFirstJob!.lockedBy).toBeNull();
  expect(finalFirstJob!.leaseExpiresAt).toBeNull();

  expect(finalSecondJob!.status).toBe('pending');
  expect(finalSecondJob!.lockedBy).toBeNull();
  expect(finalSecondJob!.leaseExpiresAt).toBeNull();
});

});
