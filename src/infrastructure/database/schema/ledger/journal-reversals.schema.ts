
import { sql } from 'drizzle-orm';

import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { journalTransactions } from './journal-transactions.schema.js';

export const journalReversals = pgTable(
  'journal_reversals',
  {
    id: uuid('id').primaryKey(),

    originalJournalId: uuid('original_journal_id').notNull(),

    reversalJournalId: uuid('reversal_journal_id').notNull(),

    currency: varchar('currency', { length: 3 }).notNull(),

    reason: text('reason').notNull(),

    // User FK will be added when the users schema is available.
    reversedBy: uuid('reversed_by'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'journal_reversals_original_journal_currency_fk',
      columns: [table.originalJournalId, table.currency],
      foreignColumns: [journalTransactions.id, journalTransactions.currency],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    foreignKey({
      name: 'journal_reversals_reversal_journal_currency_fk',
      columns: [table.reversalJournalId, table.currency],
      foreignColumns: [journalTransactions.id, journalTransactions.currency],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    check(
      'journal_reversals_different_journals_check',
      sql`${table.originalJournalId} <> ${table.reversalJournalId}`,
    ),

    check(
      'journal_reversals_reason_not_empty_check',
      sql`length(trim(${table.reason})) > 0`,
    ),

    unique('journal_reversals_reversal_journal_unique').on(
      table.reversalJournalId,
    ),

    index('journal_reversals_original_journal_idx').on(
      table.originalJournalId,
    ),
  ],
);

export type JournalReversal = typeof journalReversals.$inferSelect;
export type NewJournalReversal = typeof journalReversals.$inferInsert;
