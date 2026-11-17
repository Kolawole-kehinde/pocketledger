
import type { ChartOfAccounts } from '../../../infrastructure/database/schema/index.js';
import { accountPolicy } from './accounting.policy.js';

type ChartAccountClassification = Pick<
  ChartOfAccounts,
  'accountType' | 'normalBalance' | 'isContraAccount'
>;

interface ChartOfAccountsPolicyResult {
  valid: boolean;
  code: string | null;
  reason: string | null;
}

export const chartOfAccountsPolicy = (
  child: ChartAccountClassification,
  parent: ChartAccountClassification | null,
): ChartOfAccountsPolicyResult => {
  // Validate the child's own accounting classification.
  const childValidation = accountPolicy(
    child.accountType,
    child.normalBalance,
    child.isContraAccount,
  );

  if (!childValidation.valid) {
    return {
      valid: false,
      code: childValidation.code,
      reason: childValidation.reason,
    };
  }

  // Root accounts have no parent relationship to validate.
  if (!parent) {
    return {
      valid: true,
      code: null,
      reason: null,
    };
  }

  // Contra accounts cannot have child accounts.
  if (parent.isContraAccount) {
    return {
      valid: false,
      code: 'CONTRA_ACCOUNT_CANNOT_HAVE_CHILDREN',
      reason: 'Contra accounts cannot have child accounts.',
    };
  }

  // Child and parent must have the same account type.
  if (child.accountType !== parent.accountType) {
    return {
      valid: false,
      code: 'ACCOUNT_TYPE_MISMATCH',
      reason: 'Child and parent accounts must have the same account type.',
    };
  }

  // Regular children must share the parent's normal balance.
  // Contra children must have the opposite normal balance.
  const expectedNormalBalance = child.isContraAccount
    ? parent.normalBalance === 'DEBIT'
      ? 'CREDIT'
      : 'DEBIT'
    : parent.normalBalance;

  if (child.normalBalance !== expectedNormalBalance) {
    return {
      valid: false,
      code: 'NORMAL_BALANCE_MISMATCH',
      reason: child.isContraAccount
        ? 'Contra child accounts must have the opposite normal balance of their parent.'
        : 'Regular child accounts must have the same normal balance as their parent.',
    };
  }

  return {
    valid: true,
    code: null,
    reason: null,
  };
};
