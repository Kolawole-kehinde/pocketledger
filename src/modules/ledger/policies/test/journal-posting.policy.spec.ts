
import { describe, expect, it } from 'vitest';
import { NormalizedJournalEntry, NormalizedJournalPostingInput } from '../../types/journal.types.js';
import { journalPostingPolicy } from '../journal-posting.policy.js';

const createEntry = (
  direction: 'DEBIT' | 'CREDIT',
  amount: bigint,
  currency = 'NGN',
): NormalizedJournalEntry =>
  ({
    ledgerAccountId: direction === 'DEBIT' ? 'account-1' : 'account-2',
    account: {
      id: direction === 'DEBIT' ? 'account-1' : 'account-2',
      currency,
    },
    direction,
    amount,
  }) as NormalizedJournalEntry;

const createValidJournalInput = (
  entries?: NormalizedJournalEntry[],
): NormalizedJournalPostingInput => ({
  entries: entries ?? [
    createEntry('DEBIT', 10000n),
    createEntry('CREDIT', 10000n),
  ],
});

describe('journalPostingPolicy', () => {
  it('should accept a balanced journal with valid entries', () => {
    const result = journalPostingPolicy(createValidJournalInput());

    expect(result).toEqual({ valid: true });
  });

  it('should accept a journal with multiple balanced entries', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', 5000n),
        createEntry('DEBIT', 3000n),
        createEntry('CREDIT', 4000n),
        createEntry('CREDIT', 4000n),
      ]),
    );

    expect(result).toEqual({ valid: true });
  });

  it('should reject a journal with no entries', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'INSUFFICIENT_ENTRIES' }),
        expect.objectContaining({ code: 'MISSING_DEBIT_ENTRY' }),
        expect.objectContaining({ code: 'MISSING_CREDIT_ENTRY' }),
      ]),
    });
  });

  it('should reject a journal with only one entry', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', 10000n),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'INSUFFICIENT_ENTRIES' }),
        expect.objectContaining({ code: 'MISSING_CREDIT_ENTRY' }),
      ]),
    });
  });

  it('should reject a journal without a debit entry', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('CREDIT', 10000n),
        createEntry('CREDIT', 10000n),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_DEBIT_ENTRY' }),
      ]),
    });
  });

  it('should reject a journal without a credit entry', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', 10000n),
        createEntry('DEBIT', 10000n),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_CREDIT_ENTRY' }),
      ]),
    });
  });

  it('should reject zero entry amounts', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', 0n),
        createEntry('CREDIT', 10000n),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_ENTRY_AMOUNT',
          entryIndex: 0,
          field: 'amount',
        }),
      ]),
    });

    expect(result).not.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'JOURNAL_NOT_BALANCED' }),
      ]),
    });
  });

  it('should reject negative entry amounts', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', -5000n),
        createEntry('CREDIT', 10000n),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'INVALID_ENTRY_AMOUNT',
          entryIndex: 0,
        }),
      ]),
    });
  });

  it('should reject mixed currencies', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', 10000n, 'NGN'),
        createEntry('CREDIT', 10000n, 'USD'),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'MIXED_CURRENCIES' }),
      ]),
    });
  });

  it('should reject an unbalanced journal', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', 10000n),
        createEntry('CREDIT', 8000n),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'JOURNAL_NOT_BALANCED' }),
      ]),
    });
  });

  it('should collect multiple validation errors', () => {
    const result = journalPostingPolicy(
      createValidJournalInput([
        createEntry('DEBIT', 0n, 'NGN'),
        createEntry('DEBIT', 5000n, 'USD'),
      ]),
    );

    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_CREDIT_ENTRY' }),
        expect.objectContaining({ code: 'INVALID_ENTRY_AMOUNT' }),
        expect.objectContaining({ code: 'MIXED_CURRENCIES' }),
      ]),
    });
  });
});
