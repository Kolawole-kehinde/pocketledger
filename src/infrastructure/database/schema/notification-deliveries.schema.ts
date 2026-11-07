
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { notifications } from './notifications.schema.js';

export const notificationChannelEnum = pgEnum(
  'notification_channel',
  ['in_app', 'email', 'push', 'sms'],
);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'processing',
  'delivered',
  'failed',
  'dead_lettered',
]);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),

    channel: notificationChannelEnum('channel').notNull(),

    status: deliveryStatusEnum('status')
      .notNull()
      .default('pending'),

    attempts: integer('attempts').notNull().default(0),

    maxAttempts: integer('max_attempts').notNull().default(5),

    nextRetryAt: timestamp('next_retry_at', {
      withTimezone: true,
    }),

    providerMessageId: varchar('provider_message_id', {
      length: 255,
    }),

    failureReason: varchar('failure_reason', { length: 1000 }),

    lastAttemptAt: timestamp('last_attempt_at', {
      withTimezone: true,
    }),

    deliveredAt: timestamp('delivered_at', {
      withTimezone: true,
    }),

    deadLetteredAt: timestamp('dead_lettered_at', {
      withTimezone: true,
    }),

    lockedBy: varchar('locked_by', { length: 255 }),

    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notification_deliveries_notification_channel_unique').on(
      table.notificationId,
      table.channel,
    ),
    index('notification_deliveries_status_idx').on(table.status),
    index('notification_deliveries_notification_id_idx').on(
      table.notificationId,
    ),
    index('notification_deliveries_retry_idx').on(
      table.status,
      table.nextRetryAt,
      table.createdAt,
    ),
    index('notification_deliveries_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
  ],
);

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
