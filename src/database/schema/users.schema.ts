import {
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'support',
  'admin',
]);

export const userStatusEnum = pgEnum('user_status', [
  'pending_verification',
  'active',
  'suspended',
  'closed',
]);



export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    middleName: varchar('middle_name', { length: 100 }),
    username: varchar('username', { length: 50 }),
    phoneNumber: varchar('phone_number', { length: 20 }),
    email: varchar('email', { length: 255 }).notNull(),
    role: userRoleEnum('role').notNull().default('customer'),
    status: userStatusEnum('status').notNull().default('pending_verification'),
    createdAt: timestamp('created_at', { withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true}).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_phone_number_unique').on(table.phoneNumber),
  ],
);


export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;



