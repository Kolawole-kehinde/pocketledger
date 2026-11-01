import { z } from 'zod';

export const InboxEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.string().min(1).max(200),
  schemaVersion: z.number().int().positive(),
  aggregateType: z.string().min(1).max(100),
  aggregateId: z.string().min(1).max(255),
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: z.uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export type InboxEvent = z.infer<typeof InboxEventSchema>;