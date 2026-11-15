
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
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

    holdId: uuid('hold_id')
      .notNull()
      .references(() => financialHolds.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    reference: varchar('reference', { length: 100 })
      .notNull(),

    operationType: holdOperationType('operation_type')
      .notNull(),

    amount: bigint('amount', { mode: 'bigint' })
      .notNull(),

    sequenceNumber: integer('sequence_number')
      .notNull(),

    journalTransactionId: uuid('journal_transaction_id')
      .references(() => journalTransactions.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    performedBy: uuid('performed_by'),

    reason: text('reason').notNull(),

    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('hold_operations_reference_unique')
      .on(table.reference),

    unique('hold_operations_hold_sequence_unique')
      .on(table.holdId, table.sequenceNumber),

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
      'hold_operations_reason_not_empty_check',
      sql`length(trim(${table.reason})) > 0`,
    ),

    index('hold_operations_hold_created_idx')
      .on(table.holdId, table.createdAt),

    index('hold_operations_journal_transaction_idx')
      .on(table.journalTransactionId),
  ],
);

export type HoldOperation = typeof holdOperations.$inferSelect;
export type NewHoldOperation = typeof holdOperations.$inferInsert;
