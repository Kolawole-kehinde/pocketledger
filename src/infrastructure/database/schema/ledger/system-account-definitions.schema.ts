import {
  boolean,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { chartOfAccounts } from './chart-of-accounts.schema.js';

export const systemAccountDefinitions = pgTable(
  'system-account-definitions',
  {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    chartAccountId: uuid('chart_account_id')
      .notNull()
      .references(() => chartOfAccounts.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),
    allowNegativeBalance: boolean('allow_negative_balance').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
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
    unique('system_account_definitions_code_unique').on(table.code),
    // Supports ledger_accounts.system_definition_chart_account composite FK.
    unique('system_account_definitions_id_chart_account_unique').on(
      table.id,
      table.chartAccountId,
    ),
  ],
);

export type SystemAccountDefinitions = typeof systemAccountDefinitions.$inferSelect
export type NewSystemAccountDefinitions = typeof systemAccountDefinitions.$inferInsert
