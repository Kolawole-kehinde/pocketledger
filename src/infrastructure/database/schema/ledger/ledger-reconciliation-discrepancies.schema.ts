import { sql } from 'drizzle-orm';

import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  numeric,
} from 'drizzle-orm/pg-core';

import { ledgerAccounts } from './ledger-accounts.schema.js';
import { ledgerReconciliationRuns } from './ledger-reconciliation-runs.schema.js';

export const reconciliationDiscrepancyType = pgEnum(
  'reconciliation_discrepancy_type',
  [
    'BALANCE_MISMATCH',
    'DEBIT_CREDIT_IMBALANCE',
    'MISSING_BALANCE_PROJECTION',
    'ORPHANED_BALANCE_PROJECTION',
    'ENTRY_TOTAL_MISMATCH',
  ],
);

export const reconciliationDiscrepancyStatus = pgEnum(
  'reconciliation_discrepancy_status',
  ['OPEN', 'INVESTIGATING', 'RESOLVED', 'ACCEPTED'],
);

export const ledgerReconciliationDiscrepancies = pgTable(
  'ledger_reconciliation_discrepancies',
  {
    id: uuid('id').primaryKey(),

    reference: varchar('reference', { length: 100 }).notNull(),

    reconciliationRunId: uuid('reconciliation_run_id')
      .notNull()
      .references(() => ledgerReconciliationRuns.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    ledgerAccountId: uuid('ledger_account_id').references(
      () => ledgerAccounts.id,
      {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      },
    ),

    subjectReference: varchar('subject_reference', { length: 100 }),

    discrepancyType:
      reconciliationDiscrepancyType('discrepancy_type').notNull(),

    expectedValue: numeric('expected_value', {
      precision: 38,
      scale: 0,
    }),

    actualValue: numeric('actual_value', {
      precision: 38,
      scale: 0,
    }),

    difference: numeric('difference', {
      precision: 38,
      scale: 0,
    }),

    status: reconciliationDiscrepancyStatus('status').notNull().default('OPEN'),

    description: text('description').notNull(),

    resolutionReason: text('resolution_reason'),

    resolvedBy: uuid('resolved_by'),

    detectedAt: timestamp('detected_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    resolvedAt: timestamp('resolved_at', {
      withTimezone: true,
    }),

    metadata: jsonb('metadata'),
  },
  (table) => [
    unique('ledger_reconciliation_discrepancies_reference_unique').on(
      table.reference,
    ),

    check(
      'ledger_reconciliation_discrepancies_subject_check',
      sql`
        (
          ${table.ledgerAccountId} IS NOT NULL
          AND ${table.subjectReference} IS NULL
        )
        OR
        (
          ${table.ledgerAccountId} IS NULL
          AND ${table.subjectReference} IS NOT NULL
        )
      `,
    ),

    check(
      'ledger_reconciliation_discrepancies_resolution_check',
      sql`
        (
          ${table.status} IN ('OPEN', 'INVESTIGATING')
          AND ${table.resolvedAt} IS NULL
          AND ${table.resolutionReason} IS NULL
        )
        OR
        (
          ${table.status} IN ('RESOLVED', 'ACCEPTED')
          AND ${table.resolvedAt} IS NOT NULL
          AND ${table.resolutionReason} IS NOT NULL
          AND length(trim(${table.resolutionReason})) > 0
        )
      `,
    ),

    index('ledger_reconciliation_discrepancies_run_idx').on(
      table.reconciliationRunId,
    ),

    index('ledger_reconciliation_discrepancies_account_idx').on(
      table.ledgerAccountId,
    ),

    index('ledger_reconciliation_discrepancies_status_detected_idx').on(
      table.status,
      table.detectedAt,
    ),

    index('ledger_reconciliation_discrepancies_type_idx').on(
      table.discrepancyType,
    ),
  ],
);

export type LedgerReconciliationDiscrepancy =
  typeof ledgerReconciliationDiscrepancies.$inferSelect;

export type NewLedgerReconciliationDiscrepancy =
  typeof ledgerReconciliationDiscrepancies.$inferInsert;
