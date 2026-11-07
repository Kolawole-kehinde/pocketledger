
import {
  pgTable,
  timestamp,
  uuid,
  varchar,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sessions } from './sessions.schema.js';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),

    tokenHash: varchar('token_hash', { length: 128 }).notNull(),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }).notNull(),

    revokedAt: timestamp('revoked_at', {
      withTimezone: true,
    }),

    replacedByTokenId: uuid('replaced_by_token_id'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_token_hash_unique').on(table.tokenHash),
    index('refresh_tokens_session_id_idx').on(table.sessionId),
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
