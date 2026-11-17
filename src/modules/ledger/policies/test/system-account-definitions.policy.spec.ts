
import { describe, expect, it } from 'vitest';
import { systemAccountDefinitionsPolicy } from '../system-account-definitions.policy.js';

type DefinitionInput = Parameters<
  typeof systemAccountDefinitionsPolicy
>[0];

type ChartAccountInput = Parameters<
  typeof systemAccountDefinitionsPolicy
>[1];

const createDefinition = (
  overrides: Partial<DefinitionInput> = {},
): DefinitionInput => ({
  code: 'CUSTOMER_FUNDS',
  name: 'Customer Funds',
  allowNegativeBalance: false,
  ...overrides,
});

const createChartAccount = (
  overrides: Partial<ChartAccountInput> = {},
): ChartAccountInput => ({
  isActive: true,
  isContraAccount: false,
  accountType: 'ASSETS',
  normalBalance: 'DEBIT',
  hasChildren: false,
  ...overrides,
});

describe('systemAccountDefinitionsPolicy', () => {
  describe('valid definitions', () => {
    it('should accept a valid system account definition', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition(),
        createChartAccount(),
      );

      expect(result).toEqual({
        valid: true,
        code: null,
        reason: null,
      });
    });

    it('should allow negative balances when explicitly configured', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ allowNegativeBalance: true }),
        createChartAccount(),
      );

      expect(result.valid).toBe(true);
    });

    it.each([
      'ASSETS',
      'LIABILITY',
      'EQUITY',
      'EXPENSE',
      'REVENUE',
    ] as const)(
      'should accept a chart account with account type %s',
      (accountType) => {
        const result = systemAccountDefinitionsPolicy(
          createDefinition(),
          createChartAccount({ accountType }),
        );

        expect(result.valid).toBe(true);
      },
    );

    it('should accept a code containing the maximum 50 characters', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ code: `A${'B'.repeat(49)}` }),
        createChartAccount(),
      );

      expect(result.valid).toBe(true);
    });

    it('should accept a name containing the maximum 100 characters', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ name: 'A'.repeat(100) }),
        createChartAccount(),
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('code validation', () => {
    it('should reject an empty code', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ code: '' }),
        createChartAccount(),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'SYSTEM_ACCOUNT_CODE_REQUIRED',
      });
    });

    it('should reject a whitespace-only code', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ code: '   ' }),
        createChartAccount(),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'SYSTEM_ACCOUNT_CODE_REQUIRED',
      });
    });

    it('should reject a code exceeding 50 characters', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ code: `A${'B'.repeat(50)}` }),
        createChartAccount(),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'SYSTEM_ACCOUNT_CODE_TOO_LONG',
      });
    });

    it.each([
      'customer_funds',
      '1CUSTOMER',
      'CUSTOMER-FUNDS',
      'CUSTOMER FUNDS',
      '_CUSTOMER_FUNDS',
    ])('should reject an invalid code format: %s', (code) => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ code }),
        createChartAccount(),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'INVALID_SYSTEM_ACCOUNT_CODE_FORMAT',
      });
    });
  });

  describe('name validation', () => {
    it('should reject an empty name', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ name: '' }),
        createChartAccount(),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'SYSTEM_ACCOUNT_NAME_REQUIRED',
      });
    });

    it('should reject a whitespace-only name', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ name: '   ' }),
        createChartAccount(),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'SYSTEM_ACCOUNT_NAME_REQUIRED',
      });
    });

    it('should reject a name exceeding 100 characters', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition({ name: 'A'.repeat(101) }),
        createChartAccount(),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'SYSTEM_ACCOUNT_NAME_TOO_LONG',
      });
    });
  });

  describe('chart account validation', () => {
    it('should reject an inactive chart account', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition(),
        createChartAccount({ isActive: false }),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'CHART_ACCOUNT_INACTIVE',
      });
    });

    it('should reject a chart account that has children', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition(),
        createChartAccount({ hasChildren: true }),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'CHART_ACCOUNT_NOT_LEAF',
      });
    });

    it('should reject a contra chart account', () => {
      const result = systemAccountDefinitionsPolicy(
        createDefinition(),
        createChartAccount({ isContraAccount: true }),
      );

      expect(result).toMatchObject({
        valid: false,
        code: 'CONTRA_ACCOUNT_NOT_ALLOWED',
      });
    });
  });
});