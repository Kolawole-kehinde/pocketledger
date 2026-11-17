
import { describe, expect, it } from 'vitest';
import { accountStatusPolicy } from '../account-status.policy.js';


describe('accountStatusPolicy', () => {
  // 1. Active accounts should allow debit operations.
  it('should allow debit operations on active accounts', () => {
    const result = accountStatusPolicy('ACTIVE', 'DEBIT');

    expect(result.valid).toBe(true);
    expect(result.code).toBeNull();
    expect(result.reason).toBeNull();
  });

  // 2. Active accounts should allow credit operations.
  it('should allow credit operations on active accounts', () => {
    const result = accountStatusPolicy('ACTIVE', 'CREDIT');

    expect(result.valid).toBe(true);
    expect(result.code).toBeNull();
    expect(result.reason).toBeNull();
  });

  // 3. Frozen accounts must reject debit operations.
  it('should reject debit operations on frozen accounts', () => {
    const result = accountStatusPolicy('FROZEN', 'DEBIT');

    expect(result.valid).toBe(false);
    expect(result.code).toBe('ACCOUNT_FROZEN');
    expect(result.reason).toBe(
      'Frozen accounts cannot perform debit operations.',
    );
  });

  // 4. Frozen accounts should still accept incoming credits.
  it('should allow credit operations on frozen accounts', () => {
    const result = accountStatusPolicy('FROZEN', 'CREDIT');

    expect(result.valid).toBe(true);
    expect(result.code).toBeNull();
    expect(result.reason).toBeNull();
  });

  // 5. Closed accounts must reject debit operations.
  it('should reject debit operations on closed accounts', () => {
    const result = accountStatusPolicy('CLOSED', 'DEBIT');

    expect(result.valid).toBe(false);
    expect(result.code).toBe('ACCOUNT_CLOSED');
    expect(result.reason).toBe(
      'Closed accounts cannot perform financial operations.',
    );
  });

  // 6. Closed accounts must reject credit operations.
  it('should reject credit operations on closed accounts', () => {
    const result = accountStatusPolicy('CLOSED', 'CREDIT');

    expect(result.valid).toBe(false);
    expect(result.code).toBe('ACCOUNT_CLOSED');
    expect(result.reason).toBe(
      'Closed accounts cannot perform financial operations.',
    );
  });

  // 7. Unknown status or operation values should be rejected defensively.
  it('should reject an invalid account status or operation', () => {
    const result = accountStatusPolicy(
      'UNKNOWN' as 'ACTIVE',
      'DEBIT',
    );

    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_ACCOUNT_STATUS');
    expect(result.reason).toBe(
      'The account status or operation is invalid.',
    );
  });
});
