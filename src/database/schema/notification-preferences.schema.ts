
import {
  pgTable,
  timestamp,
  uuid,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.js';
import { notificationTypeEnum } from './notifications.schema.js';
import { notificationChannelEnum } from './notification-deliveries.schema.js';

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    type: notificationTypeEnum('type').notNull(),

    channel: notificationChannelEnum('channel').notNull(),

    enabled: boolean('enabled').notNull().default(true),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notification_preferences_user_type_channel_unique').on(
      table.userId,
      table.type,
      table.channel,
    ),
    index('notification_preferences_user_id_idx').on(table.userId),
  ],
);

export type NotificationPreference =typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =typeof notificationPreferences.$inferInsert;
