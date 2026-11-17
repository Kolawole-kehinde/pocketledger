import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const accountTypeEnum = pgEnum('account_type', [
  'ASSETS',
  'LIABILITY',
  'EQUITY',
  'EXPENSE',
  'REVENUE',
]);

export const normalBalanceEnum = pgEnum('normal_balance', ['CREDIT', 'DEBIT']);

export const chartOfAccounts = pgTable(
  'chart_of_accounts',
  {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    accountType: accountTypeEnum('account_type').notNull(),
    normalBalance: normalBalanceEnum('normal_balance').notNull(),
    parentAccountId: uuid('parent_account_id').references(
      (): AnyPgColumn => chartOfAccounts.id,
      {
        onDelete: 'restrict',
        onUpdate: 'restrict',
      },
    ),
    isContraAccount: boolean('is_contra_account').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
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
    unique('chart_of_accounts_code_unique').on(table.code),
    check(
      'chart_of_accounts_no_self_parent_check',
      sql`${table.parentAccountId} IS NULL OR ${table.id} <> ${table.parentAccountId}`,
    ),
  ],
);

export type ChartOfAccounts = typeof chartOfAccounts.$inferSelect;
export type NewChartOfAccounts = typeof chartOfAccounts.$inferInsert;
