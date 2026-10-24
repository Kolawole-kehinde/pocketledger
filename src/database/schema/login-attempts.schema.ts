
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  inet,
  boolean,
  doublePrecision,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.js';

export const loginFailureReasonEnum = pgEnum(
  'login_failure_reason',
  [
    'invalid_otp',
    'otp_expired',
    'otp_already_used',
    'too_many_attempts',
    'rate_limited',
    'account_unavailable',
    'session_creation_failed',
  ],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    email: varchar('email', { length: 255 }),

    success: boolean('success').notNull(),

    failureReason: loginFailureReasonEnum('failure_reason'),

    ipAddress: inet('ip_address'),

    userAgent: varchar('user_agent', { length: 1000 }),

    country: varchar('country', { length: 100 }),

    city: varchar('city', { length: 100 }),

    latitude: doublePrecision('latitude'),

    longitude: doublePrecision('longitude'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    index('login_attempts_user_id_idx').on(table.userId),
    index('login_attempts_email_idx').on(table.email),
    index('login_attempts_ip_address_idx').on(table.ipAddress),
    index('login_attempts_created_at_idx').on(table.createdAt),
  ],
);

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
