
import { sql } from 'drizzle-orm';

import {
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { currencies } from './currencies.schema.js';

export const transactionType = pgEnum('transaction_type', [
  'TRANSFER',
  'DEPOSIT',
  'WITHDRAWAL',
  'PAYMENT',
  'FEE',
  'REFUND',
  'REVERSAL',
  'ADJUSTMENT',
]);

export const journalStatus = pgEnum('journal_status', [
  'DRAFT',
  'POSTED',
]);

export const journalTransactions = pgTable(
  'journal_transactions',
  {
    id: uuid('id').primaryKey(),

    reference: varchar('reference', { length: 40 }).notNull(),

    transactionType: transactionType('transaction_type').notNull(),

    status: journalStatus('status').notNull().default('DRAFT'),

    currency: varchar('currency', { length: 3 })
      .notNull()
      .references(() => currencies.code, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    description: text('description'),

    metadata: jsonb('metadata'),

    sourceModule: varchar('source_module', { length: 50 }).notNull(),

    sourceReference: varchar('source_reference', { length: 150 }).notNull(),

    postingPurpose: varchar('posting_purpose', { length: 50 }).notNull(),

    postedAt: timestamp('posted_at', {
      withTimezone: true,
    }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('journal_transactions_reference_unique')
      .on(table.reference),

    unique('journal_transactions_source_operation_unique')
      .on(
        table.sourceModule,
        table.sourceReference,
        table.postingPurpose,
      ),

    unique('journal_transactions_id_currency_unique')
      .on(table.id, table.currency),

    check(
      'journal_transactions_reference_not_empty_check',
      sql`length(trim(${table.reference})) > 0`,
    ),

    check(
      'journal_transactions_source_module_not_empty_check',
      sql`length(trim(${table.sourceModule})) > 0`,
    ),

    check(
      'journal_transactions_source_reference_not_empty_check',
      sql`length(trim(${table.sourceReference})) > 0`,
    ),

    check(
      'journal_transactions_posting_purpose_not_empty_check',
      sql`length(trim(${table.postingPurpose})) > 0`,
    ),

    // DRAFT journals must not have a posting timestamp.
    // POSTED journals must have a posting timestamp.
    check(
      'journal_transactions_status_posted_at_check',
      sql`(
        (${table.status} = 'DRAFT' AND ${table.postedAt} IS NULL)
        OR
        (${table.status} = 'POSTED' AND ${table.postedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export type JournalTransaction =
  typeof journalTransactions.$inferSelect;

export type NewJournalTransaction =
  typeof journalTransactions.$inferInsert;
