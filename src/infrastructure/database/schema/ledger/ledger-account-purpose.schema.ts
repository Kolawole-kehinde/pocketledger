import { pgEnum } from 'drizzle-orm/pg-core';

export const ledgerAccountPurposeEnum = pgEnum(
  'ledger_account_purpose',
  [
    'SPENDABLE_WALLET',
    'LOCKED_SAVINGS',
    'SYSTEM_CLEARING',
    'SYSTEM_REVENUE',
    'SYSTEM_CASH',
  ],
);