
import { describe, expect, it } from 'vitest';
import { chartOfAccountsPolicy } from '../chart-of-accounts.policy.js';


type ChartAccountClassification = Parameters<
  typeof chartOfAccountsPolicy
>[0];

describe('chartOfAccountsPolicy', () => {
  it('should accept a valid root account', () => {
    const child: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const result = chartOfAccountsPolicy(child, null);

    expect(result).toEqual({
      valid: true,
      code: null,
      reason: null,
    });
  });

  it('should reject a child with invalid accounting classification', () => {
    const child: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'CREDIT',
      isContraAccount: false,
    };

    const parent: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const result = chartOfAccountsPolicy(child, parent);

    expect(result.valid).toBe(false);
    expect(result.code).not.toBeNull();
    expect(result.reason).not.toBeNull();
  });

  it('should reject a contra account as a parent', () => {
    const child: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const parent: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'CREDIT',
      isContraAccount: true,
    };

    const result = chartOfAccountsPolicy(child, parent);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('CONTRA_ACCOUNT_CANNOT_HAVE_CHILDREN');
  });

  it('should reject a child with a different account type from its parent', () => {
    const child: ChartAccountClassification = {
      accountType: 'LIABILITY',
      normalBalance: 'CREDIT',
      isContraAccount: false,
    };

    const parent: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const result = chartOfAccountsPolicy(child, parent);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('ACCOUNT_TYPE_MISMATCH');
  });

  it('should accept a regular child with the same normal balance as its parent', () => {
    const child: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const parent: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const result = chartOfAccountsPolicy(child, parent);

    expect(result).toEqual({
      valid: true,
      code: null,
      reason: null,
    });
  });

  it('should reject a regular child with a different normal balance', () => {
    const child: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const parent: ChartAccountClassification = {
      accountType: 'LIABILITY',
      normalBalance: 'CREDIT',
      isContraAccount: false,
    };

    // Use the same account type so this test isolates normal-balance validation.
    const validParent: ChartAccountClassification = {
      ...parent,
      accountType: 'ASSETS',
    };

    const result = chartOfAccountsPolicy(child, validParent);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('NORMAL_BALANCE_MISMATCH');
  });

  it('should accept a contra child with the opposite normal balance', () => {
    const child: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'CREDIT',
      isContraAccount: true,
    };

    const parent: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'DEBIT',
      isContraAccount: false,
    };

    const result = chartOfAccountsPolicy(child, parent);

    expect(result).toEqual({
      valid: true,
      code: null,
      reason: null,
    });
  });

  it('should reject a contra child with the same normal balance as its parent', () => {
    const child: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'CREDIT',
      isContraAccount: true,
    };

    const parent: ChartAccountClassification = {
      accountType: 'ASSETS',
      normalBalance: 'CREDIT',
      isContraAccount: false,
    };

    const result = chartOfAccountsPolicy(child, parent);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('NORMAL_BALANCE_MISMATCH');
  });
});
