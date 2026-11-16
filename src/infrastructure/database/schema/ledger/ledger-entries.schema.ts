
import { sql } from 'drizzle-orm';

import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { journalTransactions } from './journal-transactions.schema.js';
import { ledgerAccounts } from './ledger-accounts.schema.js';

export const entryType = pgEnum('entry_type', [
  'DEBIT',
  'CREDIT',
]);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey(),

    journalTransactionId: uuid('journal_transaction_id').notNull(),

    ledgerAccountId: uuid('ledger_account_id').notNull(),

    entryType: entryType('entry_type').notNull(),

    amount: bigint('amount', { mode: 'bigint' }).notNull(),

    currency: varchar('currency', { length: 3 }).notNull(),

    description: text('description'),

    sequenceNumber: integer('sequence_number').notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Ensure the entry currency matches its journal currency.
    foreignKey({
      name: 'ledger_entries_journal_currency_fk',
      columns: [
        table.journalTransactionId,
        table.currency,
      ],
      foreignColumns: [
        journalTransactions.id,
        journalTransactions.currency,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    // Ensure the entry currency matches its ledger account currency.
    foreignKey({
      name: 'ledger_entries_account_currency_fk',
      columns: [
        table.ledgerAccountId,
        table.currency,
      ],
      foreignColumns: [
        ledgerAccounts.id,
        ledgerAccounts.currency,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    check(
      'ledger_entries_amount_check',
      sql`${table.amount} > 0`,
    ),

    check(
      'ledger_entries_sequence_number_check',
      sql`${table.sequenceNumber} > 0`,
    ),

    unique('ledger_entries_journal_sequence_unique')
      .on(
        table.journalTransactionId,
        table.sequenceNumber,
      ),

    // Supports account transaction history and chronological queries.
    index('ledger_entries_account_created_idx')
      .on(
        table.ledgerAccountId,
        table.createdAt,
        table.id,
      ),
  ],
);

export type LedgerEntry = typeof ledgerEntries.$inferSelect;

export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
