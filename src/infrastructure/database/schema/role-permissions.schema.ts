import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { roles } from './roles.schema.js';

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: varchar('role_id', { length: 50 })
      .notNull()
      .references(() => roles.id, {
        onDelete: 'cascade',
        onUpdate: 'restrict',
      }),
    permission: varchar('permission', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'role_permissions_role_id_permission_pk',
      columns: [table.roleId, table.permission],
    }),
    index('role_permissions_permission_idx').on(table.permission),
  ],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
