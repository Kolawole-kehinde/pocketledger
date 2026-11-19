import type {
  JournalPostingError,
  NormalizedJournalPostingInput,
} from '../types/journal.types.js';

export const journalPostingPolicy = (input: NormalizedJournalPostingInput) => {
  const errors: JournalPostingError[] = [];
  const { entries } = input;

  // 1. Minimum entry count
  if (entries.length < 2) {
    errors.push({
      code: 'INSUFFICIENT_ENTRIES',
      message: 'A journal must contain at least two entries.',
      field: 'entries',
    });
  }

  // 2. Required debit entry
  if (!entries.some((entry) => entry.direction === 'DEBIT')) {
      errors.push({
        code: 'MISSING_DEBIT_ENTRY',
        message: 'A journal must contain at least one debit entry.',
        field: 'entries',
      })

      return errors.length > 0
    ? { valid: false as const, errors }
    : { valid: true as const };
  }

  // 3. Required debit entry
     if(!entries.some((entry) => entry.direction === 'CREDIT')){
         errors.push({
          code: 'MISSING_CREDIT_ENTRY',
          message: 'A journal must contain at least one credit entry.',
          field: 'entries'
         })
         return errors.length > 0
         ? {valid: false as const, errors}
         : {valid: true as const}
     }

    // 4. Required valid amoount
  entries.forEach((entry, index) => {
  if (typeof entry.amount !== 'bigint' || entry.amount <= 0n) {
    errors.push({
      code: 'INVALID_ENTRY_AMOUNT',
      message: 'Entry amount must be a positive bigint.',
      entryIndex: index,
      field: 'amount',
    });
  }
});

// 5. Validate mix-currency
const currencies = new Set(
  entries.map((entry) => entry.account.currency),
);

if (currencies.size > 1) {
  errors.push({
    code: 'MIXED_CURRENCIES',
    message: 'All journal entries must use the same currency.',
    field: 'entries',
  });
}


// 6. Validate JOURNAL_NOT_BALANCED
const debitTotal = entries.reduce((total, entry) => {
  return entry.direction === 'DEBIT'
    ? total + entry.amount
    : total;
}, 0n);

const creditTotal = entries.reduce((total, entry) => {
  return entry.direction === 'CREDIT'
    ? total + entry.amount
    : total;
}, 0n);

if (debitTotal !== creditTotal) {
  errors.push({
    code: 'JOURNAL_NOT_BALANCED',
    message: 'Total debits must equal total credits.',
    field: 'entries',
  });
}
};
