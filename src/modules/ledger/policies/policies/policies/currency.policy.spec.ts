
import { describe, expect, it } from 'vitest';
import { currencyPolicy } from '../currency.policy.js';

describe('currencyPolicy', () => {
  // 1. An existing, active currency with valid properties should be accepted.
  it('should accept an existing active NGN currency', () => {
    const currency = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      code: 'NGN',
      name: 'Nigerian Naira',
      minorUnit: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = currencyPolicy(currency);

    expect(result.valid).toBe(true);
    expect(result.code).toBeNull();
    expect(result.reason).toBeNull();
  });

  // 2. A null value means the requested currency does not exist.
  it('should reject a currency that does not exist', () => {
    const result = currencyPolicy(null);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('CURRENCY_NOT_FOUND');
    expect(result.reason).toBe('The requested currency does not exist.');
  });

  // 3. Currency codes must contain exactly three uppercase letters.
  it('should reject an invalid currency code', () => {
    const currency = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      code: 'NG',
      name: 'Nigerian Naira',
      minorUnit: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = currencyPolicy(currency);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_CURRENCY_CODE');
    expect(result.reason).toBe(
      'Currency code must contain exactly three uppercase letters.',
    );
  });

  // 4. Minor units cannot be negative.
  it('should reject a minor unit below 0', () => {
    const currency = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      code: 'NGN',
      name: 'Nigerian Naira',
      minorUnit: -1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = currencyPolicy(currency);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_CURRENCY_MINOR_UNIT');
    expect(result.reason).toBe(
      'Currency minor unit must be between 0 and 4.',
    );
  });

  // 5. Minor units cannot exceed the maximum supported value of 4.
  it('should reject a minor unit above 4', () => {
    const currency = {
      id: '550e8400-e29b-41d4-a716-446655440006',
      code: 'NGN',
      name: 'Nigerian Naira',
      minorUnit: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = currencyPolicy(currency);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('INVALID_CURRENCY_MINOR_UNIT');
    expect(result.reason).toBe(
      'Currency minor unit must be between 0 and 4.',
    );
  });

  // 6. An inactive currency must not be used for new financial operations.
  it('should reject an inactive currency', () => {
    const currency = {
      id: '550e8400-e29b-41d4-a716-446655440007',
      code: 'NGN',
      name: 'Nigerian Naira',
      minorUnit: 2,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = currencyPolicy(currency);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('CURRENCY_INACTIVE');
    expect(result.reason).toBe(
      'This currency is inactive and cannot be used for new financial operations.',
    );
  });

  // 7. Zero is a valid minor unit for currencies without fractional units.
  it('should accept a currency with zero minor units', () => {
    const currency = {
      id: '550e8400-e29b-41d4-a716-446655440008',
      code: 'JPY',
      name: 'Japanese Yen',
      minorUnit: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = currencyPolicy(currency);

    expect(result.valid).toBe(true);
    expect(result.code).toBeNull();
    expect(result.reason).toBeNull();
  });
});
