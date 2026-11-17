import { describe, expect, it } from 'vitest';
import { accountPolicy } from '../accounting.policy.js';

describe('accountPolicy', () => {
  it('should accept DEBIT as the normal balance for a regular ASSETS account', () => {
    const result = accountPolicy('ASSETS', 'DEBIT', false);

    expect(result).toEqual({
      valid: true,
      code: null,
      reason: null,
    });
  });
});


describe('accountPolicy', () => {
  it('should accept DEBIT as the normal balance for a contra REVENUE account', () => {
    const result = accountPolicy('REVENUE', 'DEBIT', true);

    expect(result).toEqual({
      valid: true,
      code: null,
      reason: null,
    });
  });
});


it('should reject DEBIT as the normal balance for a regular REVENUE account', () => {
  const result = accountPolicy('REVENUE', 'DEBIT', false);

  expect(result).toEqual({
    valid: false,
    code: 'INVALID_NORMAL_BALANCE',
    reason: 'Expected CREDIT for REVENUE account.',
  });
});


describe('accountPolicy', () => {
  describe('regular accounts', () => {
    it('should accept DEBIT for ASSETS', () => {
      const result = accountPolicy('ASSETS', 'DEBIT', false);

      expect(result.valid).toBe(true);
    });

    it('should accept CREDIT for LIABILITY', () => {
      const result = accountPolicy('LIABILITY', 'CREDIT', false);

      expect(result.valid).toBe(true);
    });

    it('should accept CREDIT for EQUITY', () => {
      const result = accountPolicy('EQUITY', 'CREDIT', false);

      expect(result.valid).toBe(true);
    });

    it('should accept DEBIT for EXPENSE', () => {
      const result = accountPolicy('EXPENSE', 'DEBIT', false);

      expect(result.valid).toBe(true);
    });

    it('should accept CREDIT for REVENUE', () => {
      const result = accountPolicy('REVENUE', 'CREDIT', false);

      expect(result.valid).toBe(true);
    });
  });

  describe('contra accounts', () => {
    it('should accept CREDIT for contra ASSETS', () => {
      const result = accountPolicy('ASSETS', 'CREDIT', true);

      expect(result.valid).toBe(true);
    });

    it('should accept DEBIT for contra LIABILITY', () => {
      const result = accountPolicy('LIABILITY', 'DEBIT', true);

      expect(result.valid).toBe(true);
    });

    it('should accept DEBIT for contra EQUITY', () => {
      const result = accountPolicy('EQUITY', 'DEBIT', true);

      expect(result.valid).toBe(true);
    });

    it('should accept CREDIT for contra EXPENSE', () => {
      const result = accountPolicy('EXPENSE', 'CREDIT', true);

      expect(result.valid).toBe(true);
    });

    it('should accept DEBIT for contra REVENUE', () => {
      const result = accountPolicy('REVENUE', 'DEBIT', true);

      expect(result.valid).toBe(true);
    });
  });

  describe('invalid normal balances', () => {
    it('should reject DEBIT for a regular REVENUE account', () => {
      const result = accountPolicy('REVENUE', 'DEBIT', false);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_NORMAL_BALANCE');
      expect(result.reason).toBe('Expected CREDIT for REVENUE account.');
    });

    it('should reject CREDIT for a regular ASSETS account', () => {
      const result = accountPolicy('ASSETS', 'CREDIT', false);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_NORMAL_BALANCE');
    });

    it('should reject DEBIT for a contra ASSETS account', () => {
      const result = accountPolicy('ASSETS', 'DEBIT', true);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_NORMAL_BALANCE');
    });
  });
});
