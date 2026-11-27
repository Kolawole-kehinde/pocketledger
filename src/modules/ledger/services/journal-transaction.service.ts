import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type { Database } from '../../../infrastructure/database/database.types.js';

import { JournalTransactionRepository } from '../repositories/journal-transaction.repository.js';

import { journalPostingPolicy } from '../policies/journal-posting.policy.js';
import { accountStatusPolicy } from '../policies/account-status.policy.js';

import type {
  CreateJournalPostingInput,
  NormalizedJournalEntry,
} from '../types/journal.types.js';

import type {
  BalancePostingEntry,
  BalanceAccountContext,
} from '../types/balance.types.js';

import { BalanceService } from './balance.service.js';

@Injectable()
export class JournalTransactionService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly journalTransactionRepository: JournalTransactionRepository,
    private readonly balanceService: BalanceService,
  ) {}

  async createPostingJournal(input: CreateJournalPostingInput) {
    const uniqueIds = [
      ...new Set(input.entries.map((entry) => entry.ledgerAccountId)),
    ].sort();

    // Preliminary account existence check.
    const accounts =
      await this.journalTransactionRepository.findLedgerAccountsByIds(
        uniqueIds,
      );

    const returnedIds = new Set(accounts.map((account) => account.id));

    const missingIds = uniqueIds.filter((id) => !returnedIds.has(id));

    if (missingIds.length > 0) {
      throw new NotFoundException({
        message: 'One or more ledger accounts were not found.',
        missingAccountIds: missingIds,
      });
    }

    return this.db.transaction(async (tx) => {
      // Lock ledger accounts in deterministic order.
      const lockedAccounts =
        await this.journalTransactionRepository.lockLedgerAccountsByIds(
          tx,
          uniqueIds,
        );

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

      // Normalize and validate account status.
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

      // Validate journal-level posting rules.
      const journalValidation = journalPostingPolicy({
        entries: normalizedEntries,
      });

      if (!journalValidation.valid) {
        throw new BadRequestException(journalValidation.errors);
      }

      // Currency is derived from validated account context.
      const currency = normalizedEntries[0].account.currency;

      const journalId = randomUUID();
      const now = new Date();
      const postedAt = now;

      const journalReference = `JRN-${journalId}`;

      // Create DRAFT journal.
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

      // Prepare immutable journal entries.
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

      // Insert journal entries.
      await this.journalTransactionRepository.createJournalEntries(
        tx,
        preparedEntries,
      );

      // Build the balance movements from the validated entries.
      const balancePostingEntries: BalancePostingEntry[] =
        normalizedEntries.map((entry) => ({
          ledgerAccountId: entry.ledgerAccountId,
          direction: entry.direction,
          amount: entry.amount,
        }));

      // Fetch authoritative normal-balance configurations
      // from chart_of_accounts within the same transaction.
      const normalBalances =
        await this.journalTransactionRepository.findNormalBalancesByChartAccountIds(
          tx,
          lockedAccounts.map((account) => account.chartAccountId),
        );

      const normalBalanceMap = new Map(
        normalBalances.map((account) => [
          account.chartAccountId,
          account.normalBalance,
        ]),
      );

      // Build the account context required by BalanceService.
      const balanceAccountContexts: BalanceAccountContext[] =
        lockedAccounts.map((account) => {
          const normalBalance = normalBalanceMap.get(account.chartAccountId);

          if (!normalBalance) {
            throw new InternalServerErrorException({
              code: 'CHART_ACCOUNT_NORMAL_BALANCE_MISSING',
              message:
                'Normal balance configuration is missing for a chart account.',
              chartAccountId: account.chartAccountId,
            });
          }

          return {
            id: account.id,
            ownerType: account.ownerType,
            accountPurpose: account.accountPurpose,
            normalBalance,
          };
        });

      // Update balance projections before transitioning
      // the journal to POSTED. All changes remain atomic.
      await this.balanceService.applyJournalMovements(
        tx,
        balancePostingEntries,
        balanceAccountContexts,
        postedAt,
      );

      // Transition the journal to POSTED.
      const postedJournal =
        await this.journalTransactionRepository.markJournalAsPosted(
          tx,
          journal.id,
          postedAt,
        );

      if (!postedJournal) {
        throw new ConflictException('Journal transaction could not be posted.');
      }

      return postedJournal;
    });
  }
}
