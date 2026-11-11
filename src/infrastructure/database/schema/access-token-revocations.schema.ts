import {
  index,
  inet,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sessions } from './sessions.schema.js';
import { users } from './users.schema.js';

export const accessTokenRevocationReasonEnum = pgEnum(
  'access_token_revocation_reason',
  [
    'user_logout',
    'logout_all',
    'session_revoked',
    'refresh_token_reuse',
    'security_concern',
    'account_suspended',
    'account_closed',
    'role_changed',
    'admin_revoked',
  ],
);

/**
 * Denylist of access-token identifiers (`jti`) that must no longer be
 * accepted before their natural expiry. Rows are only useful until the token
 * expires, so the auth cleanup worker removes them afterwards.
 */
export const accessTokenRevocations = pgTable(
  'access_token_revocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jti: uuid('jti').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, {
      onDelete: 'cascade',
    }),
    reason: accessTokenRevocationReasonEnum('reason').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp('revoked_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    userAgent: varchar('user_agent', { length: 1000 }),
    ipAddress: inet('ip_address'),
  },
  (table) => [
    uniqueIndex('access_token_revocations_jti_unique').on(table.jti),
    index('access_token_revocations_user_id_idx').on(table.userId),
    index('access_token_revocations_session_id_idx').on(table.sessionId),
    index('access_token_revocations_expires_at_idx').on(table.expiresAt),
  ],
);

export type AccessTokenRevocation =
  typeof accessTokenRevocations.$inferSelect;
export type NewAccessTokenRevocation =
  typeof accessTokenRevocations.$inferInsert;
