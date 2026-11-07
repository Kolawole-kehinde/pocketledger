import { z } from 'zod';
import { emailOutbox } from '../../database/schema/email-outbox.schema.js';

const emailTemplateValues = emailOutbox.template.enumValues;

export const EnqueueEmailSchema = z.object({
  recipient: z.email(),
  template: z.enum(emailTemplateValues),
  encryptedPayload: z.string().min(1),
  encryptionKeyVersion: z.string().min(1),
  availableAt: z.coerce.date().optional(),
  maxAttempts: z.number().int().positive().max(20).optional(),
});


export const ClaimedEmailOutboxRowSchema = z.object({
  id: z.string().uuid(),
  recipient: z.string().email(),
  template: z.enum(emailOutbox.template.enumValues),
  encrypted_payload: z.string().min(1),
  encryption_key_version: z.string().min(1),
  attempt_count: z.coerce.number().int().positive(),
  max_attempts: z.coerce.number().int().positive(),
  claim_token: z.string().uuid(),
});

export const ClaimedEmailOutboxRowsSchema = z.array(ClaimedEmailOutboxRowSchema,);
export type EnqueueEmailInput = z.infer<typeof EnqueueEmailSchema>;