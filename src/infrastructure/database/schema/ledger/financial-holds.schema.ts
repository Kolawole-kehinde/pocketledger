
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

import { users } from '../users.schema.js';

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

    currency: varchar('currency', { length: 3 }).notNull(),

    amount: bigint('amount', { mode: 'bigint' }).notNull(),

   capturedAmount: bigint('captured_amount', { mode: 'bigint' })
  .notNull()
  .default(sql`0`),

releasedAmount: bigint('released_amount', { mode: 'bigint' })
  .notNull()
  .default(sql`0`),

    status: financialHoldStatus('status')
      .notNull()
      .default('ACTIVE'),

    reference: varchar('reference', { length: 100 }).notNull(),

    sourceModule: varchar('source_module', { length: 50 }).notNull(),

    sourceReference: varchar('source_reference', { length: 150 }).notNull(),

    reason: text('reason').notNull(),

    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'restrict',
      onUpdate: 'restrict',
    }),

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
    unique('financial_holds_reference_unique').on(table.reference),

    unique('financial_holds_source_operation_unique').on(
      table.sourceModule,
      table.sourceReference,
    ),

    // Required for the composite FK from hold_operations.
    unique('financial_holds_id_currency_unique').on(
      table.id,
      table.currency,
    ),

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
      sql`
        ${table.capturedAmount} >= 0
        AND ${table.capturedAmount} <= ${table.amount}
      `,
    ),

    check(
      'financial_holds_released_amount_check',
      sql`
        ${table.releasedAmount} >= 0
        AND ${table.releasedAmount} <=
          ${table.amount} - ${table.capturedAmount}
      `,
    ),

    // Enforce status consistency with captured and released amounts.
    check(
      'financial_holds_status_amount_consistency_check',
      sql`
        (
          ${table.status} = 'ACTIVE'
          AND ${table.capturedAmount} = 0
          AND ${table.releasedAmount} = 0
        )
        OR
        (
          ${table.status} = 'PARTIALLY_SETTLED'
          AND (
            ${table.capturedAmount} > 0
            OR ${table.releasedAmount} > 0
          )
          AND ${table.releasedAmount} <
            ${table.amount} - ${table.capturedAmount}
        )
        OR
        (
          ${table.status} = 'CAPTURED'
          AND ${table.capturedAmount} = ${table.amount}
          AND ${table.releasedAmount} = 0
        )
        OR
        (
          ${table.status} = 'RELEASED'
          AND ${table.capturedAmount} = 0
          AND ${table.releasedAmount} = ${table.amount}
        )
        OR
        (
          ${table.status} = 'SETTLED'
          AND ${table.capturedAmount} > 0
          AND ${table.releasedAmount} > 0
          AND ${table.releasedAmount} =
            ${table.amount} - ${table.capturedAmount}
        )
        OR
        (
          ${table.status} = 'EXPIRED'
          AND ${table.releasedAmount} > 0
          AND ${table.releasedAmount} =
            ${table.amount} - ${table.capturedAmount}
        )
      `,
    ),

    check(
      'financial_holds_reference_not_empty_check',
      sql`length(trim(${table.reference})) > 0`,
    ),

    check(
      'financial_holds_source_module_not_empty_check',
      sql`length(trim(${table.sourceModule})) > 0`,
    ),

    check(
      'financial_holds_source_reference_not_empty_check',
      sql`length(trim(${table.sourceReference})) > 0`,
    ),

    check(
      'financial_holds_reason_not_empty_check',
      sql`length(trim(${table.reason})) > 0`,
    ),

    check(
      'financial_holds_expiry_after_creation_check',
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} > ${table.createdAt}`,
    ),

    // Ensure the referenced account is a customer-owned ledger account.
    foreignKey({
      name: 'financial_holds_customer_account_fk',
      columns: [table.ledgerAccountId, table.ledgerAccountOwnerType],
      foreignColumns: [ledgerAccounts.id, ledgerAccounts.ownerType],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    // Ensure the hold uses the account's currency.
    foreignKey({
      name: 'financial_holds_account_currency_fk',
      columns: [table.ledgerAccountId, table.currency],
      foreignColumns: [ledgerAccounts.id, ledgerAccounts.currency],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),

    index('financial_holds_account_created_idx').on(
      table.ledgerAccountId,
      table.createdAt,
    ),

    index('financial_holds_expiry_idx')
      .on(table.expiresAt)
      .where(
        sql`${table.status} IN ('ACTIVE', 'PARTIALLY_SETTLED')`,
      ),
  ],
);

export type FinancialHold = typeof financialHolds.$inferSelect;
export type NewFinancialHold = typeof financialHolds.$inferInsert;
