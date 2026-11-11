import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.js';

/**
 * `grant` adds a permission that the user's role does not provide by default.
 * `revoke` removes a permission the user's role would otherwise provide.
 */
export const permissionOverrideEffectEnum = pgEnum(
  'permission_override_effect',
  ['grant', 'revoke'],
);

/**
 * Per-user permission overrides applied on top of the role permission matrix.
 *
 * A user can have at most one override per permission. Overrides are cleared
 * whenever an administrator changes the user's role, so a role change always
 * returns the account to that role's baseline.
 */
export const userPermissionOverrides = pgTable(
  'user_permission_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Permission identifier from the application permission catalog. */
    permission: varchar('permission', { length: 100 }).notNull(),

    effect: permissionOverrideEffectEnum('effect').notNull(),

    /** Administrator that granted or revoked the permission. */
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    reason: varchar('reason', { length: 500 }),

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
    uniqueIndex('user_permission_overrides_user_permission_unique').on(
      table.userId,
      table.permission,
    ),
    index('user_permission_overrides_user_id_idx').on(table.userId),
  ],
);

export type UserPermissionOverride =
  typeof userPermissionOverrides.$inferSelect;
export type NewUserPermissionOverride =
  typeof userPermissionOverrides.$inferInsert;
