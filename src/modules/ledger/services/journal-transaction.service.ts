import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type { Database } from '../../../infrastructure/database/database.types.js';
import { JournalTransactionRepository } from '../repositories/journal-transaction.repository.js';
import { journalPostingPolicy } from '../policies/journal-posting.policy.js';
import type {
  CreateJournalPostingInput,
  NormalizedJournalEntry,
} from '../types/journal.types.js';
import { journalTransactions } from '../../../infrastructure/database/schema/index.js';
import { accountStatusPolicy } from '../policies/account-status.policy.js';

@Injectable()
export class JournalTransactionService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly journalTransactionRepository: JournalTransactionRepository,
  ) {}

  async createPostingJournal(input: CreateJournalPostingInput) {
    // 1. Extract unique ledger account IDs.
    const uniqueIds = [
      ...new Set(input.entries.map((entry) => entry.ledgerAccountId)),
    ];

    // 2. Fetch ledger accounts.
    const accounts =
      await this.journalTransactionRepository.findLedgerAccountsByIds(
        uniqueIds,
      );

    // 3. Identify missing accounts.
    const returnedIds = new Set(accounts.map((account) => account.id));

    const missingIds = uniqueIds.filter((id) => !returnedIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundException({
        message: 'One or more ledger accounts were not found.',
        missingAccountIds: missingIds,
      });
    }

    // 4. Start the database transaction.
    return this.db.transaction(async (tx) => {
      // 5. Lock accounts in deterministic order.
      const lockedAccounts =
        await this.journalTransactionRepository.lockLedgerAccountsByIds(
          tx,
          uniqueIds,
        );

      // 6. Recheck existence after locking.
      const lockedAccountMap = new Map(
        lockedAccounts.map((account) => [account.id, account]),
      );

      const missingLockedIds = uniqueIds.filter(
        (id) => !lockedAccountMap.has(id),
      );

      if (missingLockedIds.length > 0) {
        throw new NotFoundException({
          message: 'One or more ledger accounts are no longer available.',
          missingAccountIds: missingLockedIds,
        });
      }

      // 7. Validate account eligibility using fresh locked records.
      const normalizedEntries: NormalizedJournalEntry[] = input.entries.map(
        (entry) => {
          const account = lockedAccountMap.get(entry.ledgerAccountId);

          if (!account) {
            throw new NotFoundException(
              `Ledger account ${entry.ledgerAccountId} was not found.`,
            );
          }
          const statusValidation = accountStatusPolicy(
            account.status,
            entry.direction,
          );

          if (!statusValidation.valid) {
            throw new ConflictException({
              code: statusValidation.code,
              message: statusValidation.reason,
              ledgerAccountId: account.id,
              operation: entry.direction,
            });
          }

          return {
            ledgerAccountId: entry.ledgerAccountId,
            account,
            direction: entry.direction,
            amount: entry.amount,
          };
        },
      );

      // 8. Validate journal-level accounting rules.
      const journalValidation = journalPostingPolicy({
        entries: normalizedEntries,
      });

      if (!journalValidation.valid) {
        throw new BadRequestException(journalValidation.errors);
      }

      // 9. Derive journal currency from validated accounts.
      const currency = normalizedEntries[0].account.currency;

      // 10. Prepare journal header.
      const journalId = randomUUID();
      const now = new Date();

      const journalReference = `JRN-${journalId}`;

      // 11. Insert DRAFT journal header.
      const journal =
        await this.journalTransactionRepository.createJournalTransaction(tx, {
          id: journalId,
          reference: journalReference,
          transactionType: input.transactionType,
          status: 'DRAFT',
          currency,
          sourceModule: input.sourceModule,
          sourceReference: input.sourceReference,
          postingPurpose: input.postingPurpose,
          createdAt: now,
        });

      if (!journal) {
        throw new ConflictException(
          'Journal transaction could not be created.',
        );
      }

      // 12. Prepare journal entries.
      const preparedEntries = normalizedEntries.map((entry, index) => ({
        id: randomUUID(),
        journalTransactionId: journal.id,
        ledgerAccountId: entry.ledgerAccountId,
        entryType: entry.direction,
        amount: entry.amount,
        currency,
        sequenceNumber: index + 1,
        createdAt: now,
      }));

      // 13. Insert all entries.
      await this.journalTransactionRepository.createJournalEntries(
        tx,
        preparedEntries,
      );

      // 14. Mark journal as POSTED.
      const postedJournal =
        await this.journalTransactionRepository.markJournalAsPosted(
          tx,
          journal.id,
          new Date(),
        );

      if (!postedJournal) {
        throw new ConflictException('Journal transaction could not be posted.');
      }

      // 15. Return the posted journal.
      return postedJournal;
    });
  }
}
