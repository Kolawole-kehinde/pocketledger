
import { sql } from 'drizzle-orm';

import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { chartOfAccounts } from './chart-of-accounts.schema.js';
import { currencies } from './currencies.schema.js';
import { systemAccountDefinitions } from './system-account-definitions.schema.js';

export const ledgerAccountOwnerTypeEnum = pgEnum(
  'ledger_account_owner_type',
  ['CUSTOMER', 'SYSTEM'],
);

export const ledgerAccountStatusEnum = pgEnum(
  'ledger_account_status',
  ['ACTIVE', 'FROZEN', 'CLOSED'],
);

export const ledgerAccountPurposeEnum = pgEnum('ledger_account_purpose', [
  'SPENDABLE_WALLET',
  'LOCKED_SAVINGS',
  'SYSTEM_CLEARING',
  'SYSTEM_REVENUE',
  'SYSTEM_CASH',
]);

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey(),

    chartAccountId: uuid('chart_account_id')
      .notNull()
      .references(() => chartOfAccounts.id, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    ownerType: ledgerAccountOwnerTypeEnum('owner_type').notNull(),

    walletId: uuid('wallet_id'),

    systemAccountDefinitionId: uuid('system_account_definition_id'),

    currency: varchar('currency', { length: 3 })
      .notNull()
      .references(() => currencies.code, {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      }),

    status: ledgerAccountStatusEnum('status')
      .notNull()
      .default('ACTIVE'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Each customer wallet has only one ledger account.
    unique('ledger_accounts_wallet_currency_unique')
  .on(table.walletId, table.currency),

    // Required for customer-only composite foreign keys.
    unique('ledger_accounts_id_owner_type_unique')
      .on(table.id, table.ownerType),

    // Required for ledger entry currency consistency.
    unique('ledger_accounts_id_currency_unique')
      .on(table.id, table.currency),

    // Each system account definition has one account per currency.
    unique('ledger_accounts_system_definition_currency_unique')
      .on(
        table.systemAccountDefinitionId,
        table.currency,
      ),

    // Enforce exactly one valid account owner.
    check(
      'ledger_accounts_owner_check',
      sql`
        (
          ${table.ownerType} = 'CUSTOMER'
          AND ${table.walletId} IS NOT NULL
          AND ${table.systemAccountDefinitionId} IS NULL
        )
        OR
        (
          ${table.ownerType} = 'SYSTEM'
          AND ${table.walletId} IS NULL
          AND ${table.systemAccountDefinitionId} IS NOT NULL
        )
      `,
    ),

    // Ensure system accounts use their definition's chart account.
    foreignKey({
      name: 'ledger_accounts_system_definition_chart_account_fk',
      columns: [
        table.systemAccountDefinitionId,
        table.chartAccountId,
      ],
      foreignColumns: [
        systemAccountDefinitions.id,
        systemAccountDefinitions.chartAccountId,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    // Supports chart-account lookup and FK-related operations.
    index('ledger_accounts_chart_account_idx')
      .on(table.chartAccountId),
  ],
);

export type LedgerAccount = typeof ledgerAccounts.$inferSelect;

export type NewLedgerAccount = typeof ledgerAccounts.$inferInsert;
