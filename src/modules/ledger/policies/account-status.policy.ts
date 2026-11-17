
import { ledgerAccountStatusEnum } from '../../../infrastructure/database/schema/index.js';

type LedgerAccountStatus =
  (typeof ledgerAccountStatusEnum.enumValues)[number];

type LedgerOperation = 'DEBIT' | 'CREDIT';

interface AccountStatusPolicyResult {
  valid: boolean;
  code: string | null;
  reason: string | null;
}

export const accountStatusPolicy = (
  status: LedgerAccountStatus,
  operation: LedgerOperation,
): AccountStatusPolicyResult => {
  // Active accounts can perform both debit and credit operations.
  if (status === 'ACTIVE') {
    return {
      valid: true,
      code: null,
      reason: null,
    };
  }

  // Frozen accounts cannot perform debit operations.
  if (status === 'FROZEN' && operation === 'DEBIT') {
    return {
      valid: false,
      code: 'ACCOUNT_FROZEN',
      reason: 'Frozen accounts cannot perform debit operations.',
    };
  }

  // Frozen accounts can still receive credits.
  if (status === 'FROZEN' && operation === 'CREDIT') {
    return {
      valid: true,
      code: null,
      reason: null,
    };
  }

  // Closed accounts cannot perform debit or credit operations.
  if (status === 'CLOSED') {
    return {
      valid: false,
      code: 'ACCOUNT_CLOSED',
      reason: 'Closed accounts cannot perform financial operations.',
    };
  }

  // Defensive fallback for unexpected values.
  return {
    valid: false,
    code: 'INVALID_ACCOUNT_STATUS',
    reason: 'The account status or operation is invalid.',
  };
};
