
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ledgerAccounts,
  ledgerAccountOwnerTypeEnum,
} from './ledger-accounts.schema.js';

export const financialHoldStatus = pgEnum('financial_hold_status', [
  'ACTIVE',
  'PARTIALLY_SETTLED',
  'CAPTURED',
  'RELEASED',
  'SETTLED',
  'EXPIRED',
]);

export const financialHolds = pgTable(
  'financial_holds',
  {
    id: uuid('id').primaryKey(),

    ledgerAccountId: uuid('ledger_account_id').notNull(),

    ledgerAccountOwnerType: ledgerAccountOwnerTypeEnum(
      'ledger_account_owner_type',
    )
      .notNull()
      .default('CUSTOMER'),

    amount: bigint('amount', { mode: 'bigint' })
      .notNull(),

    capturedAmount: bigint('captured_amount', { mode: 'bigint' })
      .notNull()
      .default(0n),

    releasedAmount: bigint('released_amount', { mode: 'bigint' })
      .notNull()
      .default(0n),

    status: financialHoldStatus('status')
      .notNull()
      .default('ACTIVE'),

    reference: varchar('reference', { length: 100 })
      .notNull(),

    sourceModule: varchar('source_module', { length: 50 })
      .notNull(),

    sourceReference: varchar('source_reference', { length: 150 })
      .notNull(),

    reason: text('reason').notNull(),

    createdBy: uuid('created_by'),

    expiresAt: timestamp('expires_at', { withTimezone: true }),

    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('financial_holds_reference_unique')
      .on(table.reference),

    unique('financial_holds_source_operation_unique')
      .on(table.sourceModule, table.sourceReference),

    check(
      'financial_holds_customer_owner_type_check',
      sql`${table.ledgerAccountOwnerType} = 'CUSTOMER'`,
    ),

    check(
      'financial_holds_amount_check',
      sql`${table.amount} > 0`,
    ),

    check(
      'financial_holds_captured_amount_check',
      sql`${table.capturedAmount} >= 0`,
    ),

    check(
      'financial_holds_released_amount_check',
      sql`${table.releasedAmount} >= 0`,
    ),

    check(
      'financial_holds_settled_amount_check',
      sql`${table.capturedAmount} + ${table.releasedAmount} <= ${table.amount}`,
    ),

    foreignKey({
      name: 'financial_holds_customer_account_fk',
      columns: [
        table.ledgerAccountId,
        table.ledgerAccountOwnerType,
      ],
      foreignColumns: [
        ledgerAccounts.id,
        ledgerAccounts.ownerType,
      ],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    index('financial_holds_account_created_idx')
      .on(table.ledgerAccountId, table.createdAt),

    index('financial_holds_expiry_idx')
      .on(table.expiresAt)
      .where(
        sql`${table.status} IN ('ACTIVE', 'PARTIALLY_SETTLED')`,
      ),
  ],
);

export type FinancialHold = typeof financialHolds.$inferSelect;
export type NewFinancialHold = typeof financialHolds.$inferInsert;
