
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';

export const emailOutboxStatusEnum = pgEnum(
  'email_outbox_status',
  ['pending', 'processing', 'sent', 'failed'],
);

export const emailTemplateEnum = pgEnum('email_template', [
  'registration_otp',
  'login_otp',
  'security_notification',
]);

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    recipient: varchar('recipient', { length: 255 }).notNull(),

    template: emailTemplateEnum('template').notNull(),

    // Store encrypted payload data only. Never persist plaintext OTPs.
    encryptedPayload: text('encrypted_payload').notNull(),

    encryptionKeyVersion: varchar('encryption_key_version', {
      length: 50,
    }).notNull(),

    status: emailOutboxStatusEnum('status')
      .notNull()
      .default('pending'),

    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),

    availableAt: timestamp('available_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
    processingAt: timestamp('processing_at', {
  withTimezone: true,
}),

lockedBy: varchar('locked_by', { length: 255 }),

leaseExpiresAt: timestamp('lease_expires_at', {
  withTimezone: true,
}),

    sentAt: timestamp('sent_at', {
      withTimezone: true,
    }),

    lastError: varchar('last_error', { length: 1000 }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    index('email_outbox_status_available_at_idx').on(
      table.status,
      table.availableAt,
    ),
    index('email_outbox_status_lease_expires_at_idx').on(
  table.status,
  table.leaseExpiresAt,
),
    index('email_outbox_created_at_idx').on(table.createdAt),
  ],
);

export type EmailOutboxJob = typeof emailOutbox.$inferSelect;
export type NewEmailOutboxJob = typeof emailOutbox.$inferInsert;
