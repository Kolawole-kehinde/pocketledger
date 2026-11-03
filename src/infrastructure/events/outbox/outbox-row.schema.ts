
import { z } from 'zod';

export const ClaimedOutboxEventRowSchema = z.object({
  id: z.string().uuid(),
  event_type: z.string().min(1),
  schema_version: z.number().int().positive(),
  aggregate_type: z.string().min(1),
  aggregate_id: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  occurred_at: z.coerce.date(),
  claim_token: z.string().uuid(),
  correlation_id: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
});

export const ClaimedOutboxEventRowsSchema = z.array(
  ClaimedOutboxEventRowSchema,
);
