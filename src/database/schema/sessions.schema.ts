
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  inet,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.js';


export const sessionRevocationReasonEnum = pgEnum(
  'session_revocation_reason',
  [
    'user_logout',
    'logout_all',
    'refresh_token_reuse',
    'security_concern',
    'password_changed',
    'account_suspended',
    'admin_revoked',
    'session_expired',
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    deviceName: varchar('device_name', { length: 255 }),
    userAgent: varchar('user_agent', { length: 1000 }),
    ipAddress: inet('ip_address'),
    country: varchar('country', { length: 100 }),
    city: varchar('city', { length: 100 }),
    lastActivityAt: timestamp('last_activity_at', {
      withTimezone: true,
    }),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }).notNull(),

    revokedAt: timestamp('revoked_at', {
      withTimezone: true,
    }),

    revokeReason: sessionRevocationReasonEnum('revoke_reason'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
    index('sessions_revoked_at_idx').on(table.revokedAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
