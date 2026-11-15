
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { journalTransactions } from './journal-transactions.schema.js';

export const journalReversals = pgTable(
  'journal_reversals',
  {
    id: uuid('id').primaryKey(),

    originalJournalId: uuid('original_journal_id')
      .notNull()
      .references(() => journalTransactions.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    reversalJournalId: uuid('reversal_journal_id')
      .notNull()
      .references(() => journalTransactions.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    reason: text('reason').notNull(),

    reversedBy: uuid('reversed_by'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
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
