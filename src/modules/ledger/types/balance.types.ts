

export type BalanceDirection = 'DEBIT' | 'CREDIT';

export type LedgerAccountPurpose =
  | 'SPENDABLE_WALLET'
  | 'LOCKED_SAVINGS'
  | 'SYSTEM_CLEARING'
  | 'SYSTEM_REVENUE'
  | 'SYSTEM_CASH';


export interface BalanceAccountContext{
    id: string;
    ownerType: 'CUSTOMER' | 'SYSTEM';
    accountPurpose: LedgerAccountPurpose;
    normalBalance: BalanceDirection
}
export interface BalancePostingEntry {
  ledgerAccountId: string;
  direction: BalanceDirection;
  amount: bigint;
}

export interface AggregatedAccountMovement{
  ledgerAccountId: string;
  totalDebits: bigint;
  totalCredits: bigint
}
export interface BalanceProjection {
  ledgerAccountId: string;
  totalDebits: bigint;
  totalCredits: bigint;
  postedBalance: bigint;
  heldAmount: bigint;
  version: bigint;
  lastEntryAt: Date | null;
}

export interface BalanceProjectionUpdate{
  ledgerAccountId: string;
  totalDebits: bigint;
  totalCredits: bigint;
  postedBalance: bigint;
  version: bigint;
  lastEntryAt: Date
 
   
}

export interface CalculateBalanceMovement{
   ledgerAccountId: string;
   totalDebits: bigint;
   totalCredits: bigint;
   netDelta: bigint;
   newPostedBalance: bigint;
   newAvailableBalance: bigint;
   newVersion: bigint
  
}