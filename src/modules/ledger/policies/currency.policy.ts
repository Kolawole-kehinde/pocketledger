import type { Currency } from '../../../infrastructure/database/schema/ledger/currencies.schema.js';

export type CurrencyPolicyInput = Pick<
  Currency,
  'code' | 'minorUnit' | 'isActive'
>;

export interface CurrencyPolicyResult {
  valid: boolean;
  code: string | null;
  reason: string | null;
}

export const currencyPolicy = (
  currency: CurrencyPolicyInput | null,
): CurrencyPolicyResult => {
  if (!currency) {
    return {
      valid: false,
      code: 'CURRENCY_NOT_FOUND',
      reason: 'The requested currency does not exist.',
    };
  }

  if (!/^[A-Z]{3}$/.test(currency.code)) {
    return {
      valid: false,
      code: 'INVALID_CURRENCY_CODE',
      reason: 'Currency code must contain exactly three uppercase letters.',
    };
  }

  if (currency.minorUnit < 0 || currency.minorUnit > 4) {
    return {
      valid: false,
      code: 'INVALID_CURRENCY_MINOR_UNIT',
      reason: 'Currency minor unit must be between 0 and 4.',
    };
  }

  if (!currency.isActive) {
    return {
      valid: false,
      code: 'CURRENCY_INACTIVE',
      reason:
        'This currency is inactive and cannot be used for new financial operations.',
    };
  }

  return {
    valid: true,
    code: null,
    reason: null,
  };
};