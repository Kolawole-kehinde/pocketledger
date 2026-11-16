import {
  boolean,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const roles = pgTable(
  'roles',
  {
    id: varchar('id', { length: 50 }).primaryKey(),
    label: varchar('label', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    level: integer('level').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('roles_label_unique').on(table.label),
  ],
);

export type RoleRecord = typeof roles.$inferSelect;
export type NewRoleRecord = typeof roles.$inferInsert;
