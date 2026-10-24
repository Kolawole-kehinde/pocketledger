import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  inet,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.js';

export const securityEventTypeEnum = pgEnum('security_event_type', [
  'otp_requested',
  'otp_verification_failed',
  'login_succeeded',
  'login_failed',
  'session_created',
  'session_revoked',
  'refresh_token_rotated',
  'refresh_token_reuse_detected',
  'rate_limit_exceeded',
  'account_suspended',
  'account_reactivated',
  'suspicious_activity_detected',
]);

export const securityEventSeverityEnum = pgEnum('security_event_severity', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const securityEvents = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    type: securityEventTypeEnum('type').notNull(),
    severity: securityEventSeverityEnum('severity').notNull().default('medium'),
    ipAddress: inet('ip_address'),
    userAgent: varchar('user_agent', { length: 1000 }),
    country: varchar('country', { length: 100 }),
    city: varchar('city', { length: 100 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    resolvedAt: timestamp('resolved_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('security_events_user_id_idx').on(table.userId),
    index('security_events_type_idx').on(table.type),
    index('security_events_severity_idx').on(table.severity),
    index('security_events_created_at_idx').on(table.createdAt),
  ],
);

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;
