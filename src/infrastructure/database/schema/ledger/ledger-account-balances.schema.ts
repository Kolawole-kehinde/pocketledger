
import { sql } from 'drizzle-orm';

import {
  bigint,
  check,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { ledgerAccounts } from './ledger-accounts.schema.js';

export const ledgerAccountBalances = pgTable(
  'ledger_account_balances',
  {
    ledgerAccountId: uuid('ledger_account_id')
      .primaryKey()
      .references(() => ledgerAccounts.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    totalDebits: numeric('total_debits', {
      precision: 38,
      scale: 0,
    })
      .notNull()
      .default('0'),

    totalCredits: numeric('total_credits', {
      precision: 38,
      scale: 0,
    })
      .notNull()
      .default('0'),

    postedBalance: numeric('posted_balance', {
      precision: 38,
      scale: 0,
    })
      .notNull()
      .default('0'),

    heldAmount: numeric('held_amount', {
      precision: 38,
      scale: 0,
    })
      .notNull()
      .default('0'),

    version: bigint('version', { mode: 'bigint' })
      .notNull()
      .default(0n),

    lastEntryAt: timestamp('last_entry_at', {
      withTimezone: true,
    }),

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
    check(
      'ledger_account_balances_total_debits_check',
      sql`${table.totalDebits} >= 0`,
    ),

    check(
      'ledger_account_balances_total_credits_check',
      sql`${table.totalCredits} >= 0`,
    ),

    check(
      'ledger_account_balances_held_amount_check',
      sql`${table.heldAmount} >= 0`,
    ),

    check(
      'ledger_account_balances_version_check',
      sql`${table.version} >= 0`,
    ),
  ],
);

export type LedgerAccountBalance =
  typeof ledgerAccountBalances.$inferSelect;

export type NewLedgerAccountBalance =
  typeof ledgerAccountBalances.$inferInsert;
