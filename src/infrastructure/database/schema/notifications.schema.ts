
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  text,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.js';

export const notificationTypeEnum = pgEnum('notification_type', [
  'security_alert',
  'transaction_update',
  'deposit_update',
  'withdrawal_update',
  'system_announcement',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'unread',
  'read',
  'archived',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    type: notificationTypeEnum('type').notNull(),

    title: varchar('title', { length: 200 }).notNull(),

    message: text('message').notNull(),

    status: notificationStatusEnum('status')
      .notNull()
      .default('unread'),

    eventId: uuid('event_id').notNull(),

    eventType: varchar('event_type', { length: 150 }).notNull(),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notifications_event_user_type_unique').on(
      table.eventId,
      table.userId,
      table.type,
    ),
    index('notifications_user_created_at_idx').on(
      table.userId,
      table.createdAt,
    ),
    index('notifications_user_read_at_idx').on(
      table.userId,
      table.readAt,
    ),
    index('notifications_event_id_idx').on(table.eventId),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
