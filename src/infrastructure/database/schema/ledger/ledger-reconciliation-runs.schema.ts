import { sql } from 'drizzle-orm';

import {
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

export const reconciliationRunType = pgEnum('reconciliation_run_type', [
  'FULL',
  'SCOPED',
]);

export const reconciliationRunStatus = pgEnum('reconciliation_run_status', [
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_DISCREPANCIES',
  'FAILED',
]);

export const reconciliationInitiatorType = pgEnum(
  'reconciliation_initiator_type',
  ['ADMIN', 'SYSTEM'],
);

export const ledgerReconciliationRuns = pgTable(
  'ledger_reconciliation_runs',
  {
    id: uuid('id').primaryKey(),

    reference: varchar('reference', { length: 100 }).notNull(),

    runType: reconciliationRunType('run_type').notNull(),

    status: reconciliationRunStatus('status').notNull().default('RUNNING'),

    initiatorType: reconciliationInitiatorType('initiator_type').notNull(),

    initiatedBy: uuid('initiated_by'),

    startedAt: timestamp('started_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    completedAt: timestamp('completed_at', {
      withTimezone: true,
    }),

    accountsChecked: integer('accounts_checked').notNull().default(0),

    discrepanciesFound: integer('discrepancies_found').notNull().default(0),

    errorCode: varchar('error_code', { length: 100 }),

    errorMessage: text('error_message'),

    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('ledger_reconciliation_runs_reference_unique').on(table.reference),

    check(
      'ledger_reconciliation_runs_accounts_checked_check',
      sql`${table.accountsChecked} >= 0`,
    ),

    check(
      'ledger_reconciliation_runs_discrepancies_found_check',
      sql`${table.discrepanciesFound} >= 0`,
    ),

    check(
      'ledger_reconciliation_runs_initiator_check',
      sql`
        (
          ${table.initiatorType} = 'ADMIN'
          AND ${table.initiatedBy} IS NOT NULL
        )
        OR
        (
          ${table.initiatorType} = 'SYSTEM'
          AND ${table.initiatedBy} IS NULL
        )
      `,
    ),

    check(
      'ledger_reconciliation_runs_completion_check',
      sql`
        (
          ${table.status} = 'RUNNING'
          AND ${table.completedAt} IS NULL
        )
        OR
        (
          ${table.status} <> 'RUNNING'
          AND ${table.completedAt} IS NOT NULL
        )
      `,
    ),

    index('ledger_reconciliation_runs_status_started_idx').on(
      table.status,
      table.startedAt,
    ),
  ],
);

export type LedgerReconciliationRun =
  typeof ledgerReconciliationRuns.$inferSelect;

export type NewLedgerReconciliationRun =
  typeof ledgerReconciliationRuns.$inferInsert;
