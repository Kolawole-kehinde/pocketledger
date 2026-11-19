import type { NewLedgerAccount } from '../../../infrastructure/database/schema/ledger/ledger-accounts.schema.js';
import type { ChartOfAccounts } from '../../../infrastructure/database/schema/ledger/chart-of-accounts.schema.js';
import type { SystemAccountDefinitions } from '../../../infrastructure/database/schema/ledger/system-account-definitions.schema.js';
import { CurrencyPolicyInput } from '../policies/currency.policy.js';

export interface LedgerAccountPolicyResult {
  valid: boolean;
  code: string | null;
  reason: string | null;
}

export type LedgerAccountBaseInput = Pick<
  NewLedgerAccount,
  'chartAccountId' | 'currency'
>;

export type CustomerLedgerAccountInput = LedgerAccountBaseInput & {
  ownerType: 'CUSTOMER';
  walletId: string;
  systemAccountDefinitionId: null;
};

export type SystemLedgerAccountInput = LedgerAccountBaseInput & {
  ownerType: 'SYSTEM';
  walletId: null;
  systemAccountDefinitionId: string;
};

export type ChartAccountPolicyInput = Pick<
  ChartOfAccounts,
  'id' | 'accountType' | 'normalBalance' | 'isContraAccount' | 'isActive'
> & {
  hasChildren: boolean;
};

export type SystemAccountDefinitionPolicyInput = Pick<
  SystemAccountDefinitions,
  'chartAccountId' | 'isActive'
>;

/**
 * The Wallet module is not implemented yet.
 * Replace this structural input with Pick<Wallet, 'currency'>
 * once the Wallet schema is available.
 */
export interface WalletCurrencyInput {
  currency: string;
}

interface CustomerLedgerAccountPolicyInput {
  ledgerAccount: CustomerLedgerAccountInput;
  chartAccount: ChartAccountPolicyInput;
  currency: CurrencyPolicyInput | null;
  wallet: WalletCurrencyInput;
  systemAccountDefinition: null;
}

interface SystemLedgerAccountPolicyInput {
  ledgerAccount: SystemLedgerAccountInput;
  chartAccount: ChartAccountPolicyInput;
  currency: CurrencyPolicyInput | null;
  wallet: null;
  systemAccountDefinition: SystemAccountDefinitionPolicyInput;
}

export type LedgerAccountPolicyInput =
  CustomerLedgerAccountPolicyInput | SystemLedgerAccountPolicyInput;
