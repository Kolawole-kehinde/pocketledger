
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database, DatabaseTransaction } from '../../../infrastructure/database/database.types.js';
import { transactionType } from '../../../infrastructure/database/schema/index.js';
import { JournalTransactionService } from './journal-transaction.service.js';
import { JournalTransactionRepository } from '../repositories/journal-transaction.repository.js';
import type {
  CreateJournalPostingInput,
  NormalizedJournalEntry,
} from '../types/journal.types.js';
import type { JournalTransaction } from '../../../infrastructure/database/schema/index.js';


describe('JournalTransactionService', () => {
  let service: JournalTransactionService;

  const tx = {} as DatabaseTransaction;

  const debitAccount = {
    id: 'account-debit',
    status: 'ACTIVE',
    currency: 'NGN',
  } as NormalizedJournalEntry['account'];

  const creditAccount = {
    id: 'account-credit',
    status: 'ACTIVE',
    currency: 'NGN',
  } as NormalizedJournalEntry['account'];

  const draftJournal = {
    id: 'journal-1',
    status: 'DRAFT',
  } as JournalTransaction;

  const postedJournal = {
    id: 'journal-1',
    status: 'POSTED',
  } as JournalTransaction;

  const repositoryMocks = {
    findLedgerAccountsByIds: vi.fn(),
    lockLedgerAccountsByIds: vi.fn(),
    createJournalTransaction: vi.fn(),
    createJournalEntries: vi.fn(),
    markJournalAsPosted: vi.fn(),
  };

  const databaseMock = {
    transaction: vi.fn(
      async (
        callback: (transaction: DatabaseTransaction) => Promise<unknown>,
      ) => callback(tx),
    ),
  };

  const input: CreateJournalPostingInput = {
    sourceModule: 'WALLET',
    sourceReference: 'transfer-001',
    postingPurpose: 'WALLET_TRANSFER',
    transactionType: transactionType.enumValues[0],
    entries: [
      {
        ledgerAccountId: 'account-debit',
        direction: 'DEBIT',
        amount: 10000n,
      },
      {
        ledgerAccountId: 'account-credit',
        direction: 'CREDIT',
        amount: 10000n,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repositoryMocks.findLedgerAccountsByIds.mockResolvedValue([
      debitAccount,
      creditAccount,
    ]);

    repositoryMocks.lockLedgerAccountsByIds.mockResolvedValue([
      debitAccount,
      creditAccount,
    ]);

    repositoryMocks.createJournalTransaction.mockResolvedValue(
      draftJournal,
    );

    repositoryMocks.createJournalEntries.mockResolvedValue([]);

    repositoryMocks.markJournalAsPosted.mockResolvedValue(
      postedJournal,
    );

    databaseMock.transaction.mockImplementation(
      async (callback) => callback(tx),
    );

    service = new JournalTransactionService(
      databaseMock as unknown as Database,
      repositoryMocks as unknown as JournalTransactionRepository,
    );
  });

  describe('createPostingJournal', () => {
    it('should create and post a valid balanced journal', async () => {
      const result = await service.createPostingJournal(input);

      expect(result).toEqual(postedJournal);

      expect(databaseMock.transaction).toHaveBeenCalledOnce();

      expect(
        repositoryMocks.lockLedgerAccountsByIds,
      ).toHaveBeenCalledWith(tx, [
        'account-debit',
        'account-credit',
      ]);

      expect(
        repositoryMocks.createJournalTransaction,
      ).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          status: 'DRAFT',
          currency: 'NGN',
          sourceModule: input.sourceModule,
          sourceReference: input.sourceReference,
        }),
      );

      expect(
        repositoryMocks.createJournalEntries,
      ).toHaveBeenCalledOnce();

      expect(
        repositoryMocks.markJournalAsPosted,
      ).toHaveBeenCalledWith(
        tx,
        draftJournal.id,
        expect.any(Date),
      );
    });

    it('should reject posting when an account does not exist', async () => {
      repositoryMocks.findLedgerAccountsByIds.mockResolvedValue([
        debitAccount,
      ]);

      await expect(
        service.createPostingJournal(input),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(databaseMock.transaction).not.toHaveBeenCalled();
    });

    it('should reject posting when an account disappears before locking', async () => {
      repositoryMocks.lockLedgerAccountsByIds.mockResolvedValue([
        debitAccount,
      ]);

      await expect(
        service.createPostingJournal(input),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(
        repositoryMocks.createJournalTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject a debit from a frozen account', async () => {
      const frozenDebitAccount = {
        ...debitAccount,
        status: 'FROZEN',
      } as NormalizedJournalEntry['account'];

      repositoryMocks.findLedgerAccountsByIds.mockResolvedValue([
        frozenDebitAccount,
        creditAccount,
      ]);

      repositoryMocks.lockLedgerAccountsByIds.mockResolvedValue([
        frozenDebitAccount,
        creditAccount,
      ]);

      await expect(
        service.createPostingJournal(input),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(
        repositoryMocks.createJournalTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should allow a credit to a frozen account', async () => {
      const frozenCreditAccount = {
        ...creditAccount,
        status: 'FROZEN',
      } as NormalizedJournalEntry['account'];

      repositoryMocks.findLedgerAccountsByIds.mockResolvedValue([
        debitAccount,
        frozenCreditAccount,
      ]);

      repositoryMocks.lockLedgerAccountsByIds.mockResolvedValue([
        debitAccount,
        frozenCreditAccount,
      ]);

      const result = await service.createPostingJournal(input);

      expect(result).toEqual(postedJournal);

      expect(
        repositoryMocks.createJournalTransaction,
      ).toHaveBeenCalledOnce();
    });

    it('should reject a debit or credit involving a closed account', async () => {
      const closedCreditAccount = {
        ...creditAccount,
        status: 'CLOSED',
      } as NormalizedJournalEntry['account'];

      repositoryMocks.findLedgerAccountsByIds.mockResolvedValue([
        debitAccount,
        closedCreditAccount,
      ]);

      repositoryMocks.lockLedgerAccountsByIds.mockResolvedValue([
        debitAccount,
        closedCreditAccount,
      ]);

      await expect(
        service.createPostingJournal(input),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(
        repositoryMocks.createJournalTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject an unbalanced journal', async () => {
      const unbalancedInput: CreateJournalPostingInput = {
        ...input,
        entries: [
          {
            ledgerAccountId: 'account-debit',
            direction: 'DEBIT',
            amount: 10000n,
          },
          {
            ledgerAccountId: 'account-credit',
            direction: 'CREDIT',
            amount: 9000n,
          },
        ],
      };

      await expect(
        service.createPostingJournal(unbalancedInput),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        repositoryMocks.createJournalTransaction,
      ).not.toHaveBeenCalled();
    });

    it('should reject posting when journal creation returns null', async () => {
      repositoryMocks.createJournalTransaction.mockResolvedValue(null);

      await expect(
        service.createPostingJournal(input),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(
        repositoryMocks.createJournalEntries,
      ).not.toHaveBeenCalled();
    });

    it('should reject posting when marking the journal as posted fails', async () => {
      repositoryMocks.markJournalAsPosted.mockResolvedValue(null);

      await expect(
        service.createPostingJournal(input),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should propagate an entry insertion failure', async () => {
      repositoryMocks.createJournalEntries.mockRejectedValue(
        new Error('Entry insertion failed'),
      );

      await expect(
        service.createPostingJournal(input),
      ).rejects.toThrow('Entry insertion failed');

      expect(
        repositoryMocks.markJournalAsPosted,
      ).not.toHaveBeenCalled();
    });
  });
});
