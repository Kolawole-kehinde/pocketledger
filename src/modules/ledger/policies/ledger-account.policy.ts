import { LedgerAccountPolicyInput, LedgerAccountPolicyResult } from "../types/ledger-account-policy.type.js";
import { accountPolicy } from "./accounting.policy.js";
import { currencyPolicy } from "./currency.policy.js";


const invalid = (
  code: string,
  reason: string,
): LedgerAccountPolicyResult => ({
  valid: false,
  code,
  reason,
});

const valid = (): LedgerAccountPolicyResult => ({
  valid: true,
  code: null,
  reason: null,
});


export const ledgerAccountPolicy = (
  input: LedgerAccountPolicyInput,
): LedgerAccountPolicyResult => {
  
  const { ledgerAccount, chartAccount, currency } = input;


// 1. Validate the ownership configuration.
if (input.wallet !== null) {
  // CUSTOMER ledger account
  if (
    input.ledgerAccount.ownerType !== 'CUSTOMER' ||
    !input.ledgerAccount.walletId ||
    input.ledgerAccount.systemAccountDefinitionId !== null ||
    input.systemAccountDefinition !== null
  ) {
    return invalid(
      'INVALID_CUSTOMER_ACCOUNT_OWNERSHIP',
      'A customer ledger account must reference a wallet and must not reference a system account definition.',
    );
  }
} else {
  // SYSTEM ledger account
  if (
    input.ledgerAccount.ownerType !== 'SYSTEM' ||
    input.ledgerAccount.walletId !== null ||
    !input.ledgerAccount.systemAccountDefinitionId ||
    !input.systemAccountDefinition
  ) {
    return invalid(
      'INVALID_SYSTEM_ACCOUNT_OWNERSHIP',
      'A system ledger account must reference a system account definition and must not reference a wallet.',
    );
  }
}

  // 2. Ensure the supplied chart account matches the requested reference.
  if (!ledgerAccount.chartAccountId) {
    return invalid(
      'CHART_ACCOUNT_REQUIRED',
      'A chart account must be specified for a ledger account.',
    );
  }

  if (ledgerAccount.chartAccountId !== chartAccount.id) {
    return invalid(
      'CHART_ACCOUNT_REFERENCE_MISMATCH',
      'The supplied chart account does not match the ledger account chart account reference.',
    );
  }

  // 3. Validate the chart account's accounting classification.
  const accountingResult = accountPolicy(
    chartAccount.accountType,
    chartAccount.normalBalance,
    chartAccount.isContraAccount,
  );

  if (!accountingResult.valid) {
    return accountingResult;
  }

  // 4. The chart account must be active.
  if (!chartAccount.isActive) {
    return invalid(
      'CHART_ACCOUNT_INACTIVE',
      'An inactive chart account cannot be used for a new ledger account.',
    );
  }

  // 5. Only leaf chart accounts can be linked to ledger accounts.
  if (chartAccount.hasChildren) {
    return invalid(
      'CHART_ACCOUNT_HAS_CHILDREN',
      'A chart account with child accounts cannot be linked to a ledger account.',
    );
  }

  // 6. Contra chart accounts are not eligible.
  if (chartAccount.isContraAccount) {
    return invalid(
      'CONTRA_CHART_ACCOUNT_NOT_ALLOWED',
      'A contra chart account cannot be linked to a ledger account.',
    );
  }

  // 7. Customer ledger accounts must use liability chart accounts.
  if (
    ledgerAccount.ownerType === 'CUSTOMER' &&
    chartAccount.accountType !== 'LIABILITY'
  ) {
    return invalid(
      'CUSTOMER_ACCOUNT_REQUIRES_LIABILITY',
      'A customer ledger account must use a liability chart account.',
    );
  }

  // 8. Validate the requested currency.
  const currencyResult = currencyPolicy(currency);

if (!currencyResult.valid) {
  return currencyResult;
}

if (!currency) {
  return invalid(
    'CURRENCY_NOT_FOUND',
    'The requested currency does not exist.',
  );
}

  if (ledgerAccount.currency !== currency.code) {
    return invalid(
      'LEDGER_ACCOUNT_CURRENCY_MISMATCH',
      'The ledger account currency does not match the supplied currency record.',
    );
  }


 // 9. Customer ledger account currency must match its wallet currency.
if (input.wallet !== null) {
  if (ledgerAccount.currency !== input.wallet.currency) {
    return invalid(
      'WALLET_CURRENCY_MISMATCH',
      'Ledger account currency must match the wallet currency.',
    );
  }
}


 // 10. Validate the system account definition.
if (input.wallet === null) {
  const definition = input.systemAccountDefinition;

  if (!definition.isActive) {
    return invalid(
      'SYSTEM_ACCOUNT_DEFINITION_INACTIVE',
      'An inactive system account definition cannot be used to create a ledger account.',
    );
  }

  if (ledgerAccount.chartAccountId !== definition.chartAccountId) {
    return invalid(
      'SYSTEM_ACCOUNT_CHART_ACCOUNT_MISMATCH',
      'The ledger account chart account must match the system account definition chart account.',
    );
  }
}

  return valid();
};
