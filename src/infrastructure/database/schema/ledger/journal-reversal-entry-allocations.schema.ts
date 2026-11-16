
import { sql } from 'drizzle-orm';

import {
  bigint,
  check,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { journalReversals } from './journal-reversals.schema.js';
import { ledgerEntries } from './ledger-entries.schema.js';

export const journalReversalEntryAllocations = pgTable(
  'journal_reversal_entry_allocations',
  {
    id: uuid('id').primaryKey(),

    journalReversalId: uuid('journal_reversal_id')
      .notNull()
      .references(() => journalReversals.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    originalEntryId: uuid('original_entry_id')
      .notNull()
      .references(() => ledgerEntries.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    reversalEntryId: uuid('reversal_entry_id')
      .notNull()
      .references(() => ledgerEntries.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    amount: bigint('amount', { mode: 'bigint' }).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'journal_reversal_entry_allocations_amount_check',
      sql`${table.amount} > 0`,
    ),

    check(
      'journal_reversal_entry_allocations_different_entries_check',
      sql`${table.originalEntryId} <> ${table.reversalEntryId}`,
    ),

    unique(
      'journal_reversal_entry_allocations_reversal_original_unique',
    ).on(table.journalReversalId, table.originalEntryId),

    unique(
      'journal_reversal_entry_allocations_reversal_entry_unique',
    ).on(table.reversalEntryId),

    index(
      'journal_reversal_entry_allocations_original_entry_idx',
    ).on(table.originalEntryId),
  ],
);

export type JournalReversalEntryAllocation =
  typeof journalReversalEntryAllocations.$inferSelect;

export type NewJournalReversalEntryAllocation =
  typeof journalReversalEntryAllocations.$inferInsert;
