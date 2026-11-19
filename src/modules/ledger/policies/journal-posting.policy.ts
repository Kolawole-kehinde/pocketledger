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


};
