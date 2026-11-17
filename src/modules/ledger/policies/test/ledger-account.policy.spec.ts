
import { describe, expect, it } from 'vitest';

import {
  accountTypeEnum,
  normalBalanceEnum,
} from '../../../../infrastructure/database/schema/ledger/chart-of-accounts.schema.js';

import {
  ledgerAccountPolicy,
  type ChartAccountPolicyInput,
  type CustomerLedgerAccountInput,
  type LedgerAccountPolicyInput,
  type SystemLedgerAccountInput,
  type WalletCurrencyInput,
} from '../ledger-account.policy.js';

import type { CurrencyPolicyInput } from '../currency.policy.js';

type AccountType = (typeof accountTypeEnum.enumValues)[number];
type NormalBalance = (typeof normalBalanceEnum.enumValues)[number];

const validCurrency: CurrencyPolicyInput = {
  code: 'NGN',
  minorUnit: 2,
  isActive: true,
};

const validCustomerChartAccount: ChartAccountPolicyInput = {
  id: 'chart-1',
  accountType: 'LIABILITY',
  normalBalance: 'CREDIT',
  isContraAccount: false,
  isActive: true,
  hasChildren: false,
};

const validSystemChartAccount: ChartAccountPolicyInput = {
  id: 'chart-1',
  accountType: 'REVENUE',
  normalBalance: 'CREDIT',
  isContraAccount: false,
  isActive: true,
  hasChildren: false,
};

const validWallet: WalletCurrencyInput = {
  currency: 'NGN',
};

const createCustomerInput = (
  overrides: {
    ledgerAccount?: Partial<CustomerLedgerAccountInput>;
    chartAccount?: Partial<ChartAccountPolicyInput>;
    currency?: CurrencyPolicyInput | null;
    wallet?: Partial<WalletCurrencyInput>;
  } = {},
): LedgerAccountPolicyInput => ({
  ledgerAccount: {
    ownerType: 'CUSTOMER',
    walletId: 'wallet-1',
    systemAccountDefinitionId: null,
    chartAccountId: 'chart-1',
    currency: 'NGN',
    ...overrides.ledgerAccount,
  },
  chartAccount: {
    ...validCustomerChartAccount,
    ...overrides.chartAccount,
  },
  currency:
  overrides.currency === undefined
    ? validCurrency
    : overrides.currency,
  wallet: {
    ...validWallet,
    ...overrides.wallet,
  },
  systemAccountDefinition: null,
});

const createSystemInput = (
  overrides: {
    ledgerAccount?: Partial<SystemLedgerAccountInput>;
    chartAccount?: Partial<ChartAccountPolicyInput>;
    currency?: CurrencyPolicyInput | null;
    systemAccountDefinition?: {
      chartAccountId: string;
      allowNegativeBalance: boolean;
      isActive: boolean;
    };
  } = {},
): LedgerAccountPolicyInput => ({
  ledgerAccount: {
    ownerType: 'SYSTEM',
    walletId: null,
    systemAccountDefinitionId: 'definition-1',
    chartAccountId: 'chart-1',
    currency: 'NGN',
    ...overrides.ledgerAccount,
  },
  chartAccount: {
    ...validSystemChartAccount,
    ...overrides.chartAccount,
  },
  currency:
  overrides.currency === undefined
    ? validCurrency
    : overrides.currency,
  wallet: null,
  systemAccountDefinition: {
    chartAccountId: 'chart-1',
    allowNegativeBalance: false,
    isActive: true,
    ...overrides.systemAccountDefinition,
  },
});

describe('ledgerAccountPolicy', () => {
  describe('CUSTOMER ledger accounts', () => {
    it('accepts a valid customer ledger account', () => {
      const result = ledgerAccountPolicy(createCustomerInput());

      expect(result).toEqual({
        valid: true,
        code: null,
        reason: null,
      });
    });

    it('rejects a customer account without a wallet reference', () => {
      const input = createCustomerInput({
        ledgerAccount: {
          walletId: '',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('INVALID_CUSTOMER_ACCOUNT_OWNERSHIP');
    });

    it('rejects a customer account that also references a system definition', () => {
      const input = createCustomerInput();

      const malformedInput = {
        ...input,
        ledgerAccount: {
          ...input.ledgerAccount,
          systemAccountDefinitionId: 'definition-1',
        },
      } as unknown as LedgerAccountPolicyInput;

      const result = ledgerAccountPolicy(malformedInput);

      expect(result.code).toBe('INVALID_CUSTOMER_ACCOUNT_OWNERSHIP');
    });

    it('rejects a customer account using an ASSETS chart account', () => {
      const input = createCustomerInput({
        chartAccount: {
          accountType: 'ASSETS',
          normalBalance: 'DEBIT',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CUSTOMER_ACCOUNT_REQUIRES_LIABILITY');
    });

    it('rejects a customer account using an EQUITY chart account', () => {
      const input = createCustomerInput({
        chartAccount: {
          accountType: 'EQUITY',
          normalBalance: 'CREDIT',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CUSTOMER_ACCOUNT_REQUIRES_LIABILITY');
    });

    it('rejects a customer account when wallet currency differs', () => {
      const input = createCustomerInput({
        currency: {
          code: 'USD',
          minorUnit: 2,
          isActive: true,
        },
        ledgerAccount: {
          currency: 'USD',
        },
        wallet: {
          currency: 'NGN',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('WALLET_CURRENCY_MISMATCH');
    });
  });

  describe('SYSTEM ledger accounts', () => {
    it('accepts a valid system ledger account', () => {
      const result = ledgerAccountPolicy(createSystemInput());

      expect(result).toEqual({
        valid: true,
        code: null,
        reason: null,
      });
    });

    it('accepts a system account with negative balances enabled', () => {
      const input = createSystemInput({
        systemAccountDefinition: {
          chartAccountId: 'chart-1',
          allowNegativeBalance: true,
          isActive: true,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.valid).toBe(true);
    });

    it('rejects a system account without a definition reference', () => {
      const input = createSystemInput({
        ledgerAccount: {
          systemAccountDefinitionId: '',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('INVALID_SYSTEM_ACCOUNT_OWNERSHIP');
    });

    it('rejects a system account that also references a wallet', () => {
      const input = createSystemInput();

      const malformedInput = {
        ...input,
        ledgerAccount: {
          ...input.ledgerAccount,
          walletId: 'wallet-1',
        },
      } as unknown as LedgerAccountPolicyInput;

      const result = ledgerAccountPolicy(malformedInput);

      expect(result.code).toBe('INVALID_SYSTEM_ACCOUNT_OWNERSHIP');
    });

    it('rejects an inactive system account definition', () => {
      const input = createSystemInput({
        systemAccountDefinition: {
          chartAccountId: 'chart-1',
          allowNegativeBalance: false,
          isActive: false,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('SYSTEM_ACCOUNT_DEFINITION_INACTIVE');
    });

    it('rejects a system account when its chart account differs from its definition', () => {
      const input = createSystemInput({
        systemAccountDefinition: {
          chartAccountId: 'chart-2',
          allowNegativeBalance: false,
          isActive: true,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('SYSTEM_ACCOUNT_CHART_ACCOUNT_MISMATCH');
    });

    it.each([
      { accountType: 'ASSETS', normalBalance: 'DEBIT' },
      { accountType: 'LIABILITY', normalBalance: 'CREDIT' },
      { accountType: 'EQUITY', normalBalance: 'CREDIT' },
      { accountType: 'EXPENSE', normalBalance: 'DEBIT' },
      { accountType: 'REVENUE', normalBalance: 'CREDIT' },
    ] as const)(
      'accepts a system account with $accountType classification',
      ({ accountType, normalBalance }) => {
        const input = createSystemInput({
          chartAccount: {
            accountType,
            normalBalance,
          },
        });

        const result = ledgerAccountPolicy(input);

        expect(result.valid).toBe(true);
      },
    );
  });

  describe('chart account validation', () => {
    it('rejects a chart account that does not match the ledger account reference', () => {
      const input = createCustomerInput({
        chartAccount: {
          id: 'chart-2',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CHART_ACCOUNT_REFERENCE_MISMATCH');
    });

    it('rejects an invalid accounting classification', () => {
      const input = createCustomerInput({
        chartAccount: {
          accountType: 'ASSETS',
          normalBalance: 'CREDIT',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('INVALID_NORMAL_BALANCE');
    });

    it('rejects an inactive chart account', () => {
      const input = createCustomerInput({
        chartAccount: {
          isActive: false,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CHART_ACCOUNT_INACTIVE');
    });

    it('rejects a chart account that has children', () => {
      const input = createCustomerInput({
        chartAccount: {
          hasChildren: true,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CHART_ACCOUNT_HAS_CHILDREN');
    });

    it('rejects a contra chart account', () => {
      const input = createCustomerInput({
        chartAccount: {
          isContraAccount: true,
          normalBalance: 'DEBIT',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CONTRA_CHART_ACCOUNT_NOT_ALLOWED');
    });
  });

  describe('currency validation', () => {
    it('rejects a missing currency', () => {
      const input = createCustomerInput({
        currency: null,
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CURRENCY_NOT_FOUND');
    });

    it('rejects an invalid currency code', () => {
      const input = createCustomerInput({
        currency: {
          code: 'NG',
          minorUnit: 2,
          isActive: true,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('INVALID_CURRENCY_CODE');
    });

    it('rejects a currency with an invalid minor unit', () => {
      const input = createCustomerInput({
        currency: {
          code: 'NGN',
          minorUnit: 5,
          isActive: true,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('INVALID_CURRENCY_MINOR_UNIT');
    });

    it('rejects an inactive currency', () => {
      const input = createCustomerInput({
        currency: {
          code: 'NGN',
          minorUnit: 2,
          isActive: false,
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('CURRENCY_INACTIVE');
    });

    it('rejects a ledger account currency that differs from its currency record', () => {
      const input = createCustomerInput({
        ledgerAccount: {
          currency: 'USD',
        },
      });

      const result = ledgerAccountPolicy(input);

      expect(result.code).toBe('LEDGER_ACCOUNT_CURRENCY_MISMATCH');
    });
  });
});
