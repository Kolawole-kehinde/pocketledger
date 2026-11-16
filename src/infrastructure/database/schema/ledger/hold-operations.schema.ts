
import { sql } from 'drizzle-orm';

import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../users.schema.js';

import { financialHolds } from './financial-holds.schema.js';
import { journalTransactions } from './journal-transactions.schema.js';

export const holdOperationType = pgEnum('hold_operation_type', [
  'CAPTURE',
  'RELEASE',
]);

export const holdOperations = pgTable(
  'hold_operations',
  {
    id: uuid('id').primaryKey(),

    holdId: uuid('hold_id').notNull(),

    currency: varchar('currency', { length: 3 }).notNull(),

    reference: varchar('reference', { length: 100 }).notNull(),

    operationType: holdOperationType('operation_type').notNull(),

    amount: bigint('amount', { mode: 'bigint' }).notNull(),

    sequenceNumber: integer('sequence_number').notNull(),

    journalTransactionId: uuid('journal_transaction_id'),

    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),

    reason: text('reason').notNull(),

    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'hold_operations_hold_currency_fk',
      columns: [table.holdId, table.currency],
      foreignColumns: [financialHolds.id, financialHolds.currency],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    // A capture journal must use the hold's currency.
    // For RELEASE, journalTransactionId is NULL and this FK is skipped.
    foreignKey({
      name: 'hold_operations_journal_currency_fk',
      columns: [table.journalTransactionId, table.currency],
      foreignColumns: [
        journalTransactions.id,
        journalTransactions.currency,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    unique('hold_operations_reference_unique').on(table.reference),

    unique('hold_operations_hold_sequence_unique').on(
      table.holdId,
      table.sequenceNumber,
    ),

    check(
      'hold_operations_amount_check',
      sql`${table.amount} > 0`,
    ),

    check(
      'hold_operations_sequence_number_check',
      sql`${table.sequenceNumber} > 0`,
    ),

    check(
      'hold_operations_journal_relationship_check',
      sql`
        (
          ${table.operationType} = 'CAPTURE'
          AND ${table.journalTransactionId} IS NOT NULL
        )
        OR
        (
          ${table.operationType} = 'RELEASE'
          AND ${table.journalTransactionId} IS NULL
        )
      `,
    ),

    check(
      'hold_operations_reference_not_empty_check',
      sql`length(trim(${table.reference})) > 0`,
    ),

    check(
      'hold_operations_reason_not_empty_check',
      sql`length(trim(${table.reason})) > 0`,
    ),

    index('hold_operations_hold_created_idx').on(
      table.holdId,
      table.createdAt,
    ),

    index('hold_operations_journal_transaction_idx').on(
      table.journalTransactionId,
    ),
  ],
);

export type HoldOperation = typeof holdOperations.$inferSelect;
export type NewHoldOperation = typeof holdOperations.$inferInsert;
