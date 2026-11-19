import type { LedgerAccount } from '../../../infrastructure/database/schema/index.js';

export type JournalPostingErrorCode =
  | 'INSUFFICIENT_ENTRIES'
  | 'MISSING_DEBIT_ENTRY'
  | 'MISSING_CREDIT_ENTRY'
  | 'INVALID_ENTRY_AMOUNT'
  | 'JOURNAL_NOT_BALANCED'
  | 'MIXED_CURRENCIES';

export interface JournalPostingError {
  code: JournalPostingErrorCode;
  message: string;
  entryIndex?: number;
  field?: string;
}

export interface CreateJournalEntryInput {
  ledgerAccountId: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: bigint;
}
export interface CreateJournalPostingInput {
  sourceModule: string;
  sourceReference: string;
  postingPurpose: string;
//   transactionType: TransactionType;
  entries: CreateJournalEntryInput[];
}

export interface NormalizedJournalEntry {
  ledgerAccountId: string;
  account: LedgerAccount;
  direction: 'DEBIT' | 'CREDIT';
  amount: bigint;
}

export interface NormalizedJournalPostingInput {
  entries: NormalizedJournalEntry[];
}
export type JournalPostingValidationResult =
  { valid: true } | { valid: false; errors: JournalPostingError[] };
