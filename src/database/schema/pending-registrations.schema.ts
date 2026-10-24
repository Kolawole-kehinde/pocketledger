
import {
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const pendingRegistrations = pgTable(
  'pending_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    email: varchar('email', { length: 255 })
      .notNull(),

    emailVerifiedAt: timestamp('email_verified_at', {
      withTimezone: true,
    }),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    })
      .notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('pending_registrations_email_unique')
      .on(table.email),
  ],
);

export type PendingRegistration =
  typeof pendingRegistrations.$inferSelect;

export type NewPendingRegistration =
  typeof pendingRegistrations.$inferInsert;
