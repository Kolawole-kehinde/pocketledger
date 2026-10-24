
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  integer,
  index,
} from 'drizzle-orm/pg-core';

export const otpPurposeEnum = pgEnum('otp_purpose', [
  'registration',
  'login',
]);


export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    email: varchar('email', { length: 255 }).notNull(),

    purpose: otpPurposeEnum('purpose').notNull(),

    codeHash: varchar('code_hash', { length: 128 }).notNull(),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }).notNull(),

    attempts: integer('attempts').notNull().default(0),

    maxAttempts: integer('max_attempts').notNull().default(5),

    consumedAt: timestamp('consumed_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    index('otp_challenges_email_purpose_idx').on(
      table.email,
      table.purpose,
    ),
    index('otp_challenges_expires_at_idx').on(table.expiresAt),
  ],
);

export type OtpChallenge = typeof otpChallenges.$inferSelect;
export type NewOtpChallenge = typeof otpChallenges.$inferInsert;
