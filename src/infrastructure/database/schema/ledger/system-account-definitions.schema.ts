import {
  boolean,
  check,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { chartOfAccounts } from './chart-of-accounts.schema.js';
import { ledgerAccountPurposeEnum } from './ledger-account-purpose.schema.js';
import { sql } from 'drizzle-orm';

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
      accountPurpose: ledgerAccountPurposeEnum('account_purpose').notNull(),
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

    unique('system_account_definitions_id_purpose_unique').on(
      table.id,
      table.accountPurpose
    ),

    check(
      'system_account_definitions_purpose_check',
      sql`
      ${table.accountPurpose} IN (
        'SYSTEM_CLEARING',
        'SYSTEM_REVENUE',
        'SYSTEM_CASH'
      )
      `
    ),

    
  ],
);

export type SystemAccountDefinitions = typeof systemAccountDefinitions.$inferSelect
export type NewSystemAccountDefinitions = typeof systemAccountDefinitions.$inferInsert
