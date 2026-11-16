import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { roles } from './roles.schema.js';
import { users } from './users.schema.js';

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
        onUpdate: 'restrict',
      }),
    roleId: varchar('role_id', { length: 50 })
      .notNull()
      .references(() => roles.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'user_roles_user_id_role_id_pk',
      columns: [table.userId, table.roleId],
    }),
    index('user_roles_role_id_idx').on(table.roleId),
  ],
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
