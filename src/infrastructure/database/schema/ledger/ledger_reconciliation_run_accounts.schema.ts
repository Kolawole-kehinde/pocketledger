
import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { ledgerAccounts } from './ledger-accounts.schema.js';
import { ledgerReconciliationRuns } from './ledger-reconciliation-runs.schema.js';

export const ledgerReconciliationRunAccounts = pgTable(
  'ledger_reconciliation_run_accounts',
  {
    reconciliationRunId: uuid('reconciliation_run_id')
      .notNull()
      .references(() => ledgerReconciliationRuns.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    ledgerAccountId: uuid('ledger_account_id')
      .notNull()
      .references(() => ledgerAccounts.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    includedAt: timestamp('included_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'ledger_reconciliation_run_accounts_pk',
      columns: [
        table.reconciliationRunId,
        table.ledgerAccountId,
      ],
    }),

    index('ledger_reconciliation_run_accounts_account_idx')
      .on(table.ledgerAccountId),
  ],
);

export type LedgerReconciliationRunAccount =
  typeof ledgerReconciliationRunAccounts.$inferSelect;

export type NewLedgerReconciliationRunAccount =
  typeof ledgerReconciliationRunAccounts.$inferInsert;
