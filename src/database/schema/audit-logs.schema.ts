
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  inet,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema.js';

export const auditActionEnum = pgEnum('audit_action', [
  'user_created',
  'user_updated',
  'user_suspended',
  'user_reactivated',
  'role_changed',
  'wallet_created',
  'deposit_initiated',
  'deposit_completed',
  'transfer_initiated',
  'transfer_completed',
  'transfer_failed',
  'refund_initiated',
  'refund_completed',
  'reversal_created',
  'admin_action',
]);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    action: auditActionEnum('action').notNull(),

    entityType: varchar('entity_type', { length: 100 }).notNull(),

    entityId: uuid('entity_id'),

    ipAddress: inet('ip_address'),

    userAgent: varchar('user_agent', { length: 1000 }),

    before: jsonb('before').$type<Record<string, unknown>>(),

    after: jsonb('after').$type<Record<string, unknown>>(),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_actor_user_id_idx').on(table.actorUserId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
