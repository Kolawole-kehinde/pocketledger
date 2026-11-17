
import {
  accountTypeEnum,
  normalBalanceEnum,
} from '../../../../infrastructure/database/schema/ledger/chart-of-accounts.schema.js';

type AccountType = (typeof accountTypeEnum.enumValues)[number];
type NormalBalance = (typeof normalBalanceEnum.enumValues)[number];

interface AccountingPolicyResult {
  valid: boolean;
  code: string | null;
  reason: string | null;
}

const DEFAULT_NORMAL_BALANCE: Record<AccountType, NormalBalance> = {
  ASSETS: 'DEBIT',
  LIABILITY: 'CREDIT',
  EQUITY: 'CREDIT',
  EXPENSE: 'DEBIT',
  REVENUE: 'CREDIT',
};

const CONTRA_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  'ASSETS',
  'LIABILITY',
  'EQUITY',
  'EXPENSE',
  'REVENUE',
]);

const oppositeBalance = (balance: NormalBalance): NormalBalance =>
  balance === 'DEBIT' ? 'CREDIT' : 'DEBIT';

export const accountPolicy = (
  accountType: AccountType,
  normalBalance: NormalBalance,
  isContraAccount: boolean,
): AccountingPolicyResult => {
  if (isContraAccount && !CONTRA_ACCOUNT_TYPES.has(accountType)) {
    return {
      valid: false,
      code: 'CONTRA_ACCOUNT_TYPE_NOT_SUPPORTED',
      reason: `Contra accounts are not supported for ${accountType}.`,
    };
  }

  const defaultBalance = DEFAULT_NORMAL_BALANCE[accountType];

  const expectedBalance = isContraAccount
    ? oppositeBalance(defaultBalance)
    : defaultBalance;

  if (normalBalance !== expectedBalance) {
    return {
      valid: false,
      code: 'INVALID_NORMAL_BALANCE',
      reason: `Expected ${expectedBalance} for ${isContraAccount ? 'contra ' : ''}${accountType} account.`,
    };
  }

  return {
    valid: true,
    code: null,
    reason: null,
  };
};