import { z } from 'zod';

export const OtpEmailPayloadSchema = z.object({
  otp: z.string().regex(/^\d{6}$/),
  expiresInMinutes: z.number().int().positive(),
});

export const SecurityNotificationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  eventType: z.enum([
    'new_login',
    'password_changed',
    'security_settings_changed',
    'suspicious_login',
  ]),
  occurredAt: z.string().datetime(),
  ipAddress: z.string().max(45).optional(),
  device: z.string().max(200).optional(),
});

export type OtpEmailPayload = z.infer<typeof OtpEmailPayloadSchema>;

export type SecurityNotificationPayload = z.infer<
  typeof SecurityNotificationPayloadSchema
>;
