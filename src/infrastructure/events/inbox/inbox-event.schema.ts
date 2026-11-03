import { z } from 'zod';

export const ClaimInboxEventsInputSchema = z.object({
  consumerName: z.string().trim().min(1, 'consumerName is required'),
  workerId: z.string().trim().min(1, 'workerId is required'),
  batchSize: z.number().int().positive(),
  leaseDuration: z.number().int().positive(),
});

export const ClaimedInboxEventRowSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  consumerName: z.string().min(1),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  schemaVersion: z.coerce.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.string().nullable(),
  occurredAt: z.coerce.date(),
  claimToken: z.string().uuid(),
  lockedBy: z.string().min(1),
  leaseExpiresAt: z.coerce.date(),
  attempts: z.coerce.number().int().positive(),
  maxAttempts: z.coerce.number().int().positive(),
});

export const ClaimedInboxEventsRowsSchema = z.array(
  ClaimedInboxEventRowSchema,
);