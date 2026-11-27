import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '../../../infrastructure/database/database.types.js';
import { BalanceRepository } from '../repositories/balance.repository.js';
import { BalancePolicy } from '../policies/balance.policy.js';
import {
  BalanceAccountContextMissingException,
  BalanceProjectionMissingException,
  InvalidBalanceMovementException,
} from '../errors/balance.errors.js';
import type {
  AggregatedAccountMovement,
  BalanceAccountContext,
  BalanceProjectionUpdate,
  BalancePostingEntry,
} from '../types/balance.types.js';

@Injectable()
export class BalanceService {
  constructor(
    private readonly balanceRepository: BalanceRepository,
    private readonly balancePolicy: BalancePolicy,
  ) {}

  async applyJournalMovements(
    tx: DatabaseTransaction,
    entries: BalancePostingEntry[],
    accounts: BalanceAccountContext[],
    postedAt: Date,
  ): Promise<void> {
    if (entries.length === 0) {
      throw new InvalidBalanceMovementException(
        'A journal must contain balance movements.',
      );
    }

    const accountsById = new Map(
      accounts.map((account) => [
        account.id,
        account,
      ]),
    );

    const movements = this.aggregateEntries(
      entries,
      accountsById,
    );

    for (const movement of movements.values()) {
      const account = accountsById.get(
        movement.ledgerAccountId,
      );

      if (!account) {
        throw new BalanceAccountContextMissingException(
          movement.ledgerAccountId,
        );
      }

      this.balancePolicy.validateAccountConfiguration(account);
      this.balancePolicy.validateMovement(movement);
    }

    const ledgerAccountIds = [...movements.keys()].sort(
      (a, b) => a.localeCompare(b),
    );

    await this.balanceRepository.ensureBalanceRows(
      tx,
      ledgerAccountIds,
    );

    const lockedBalances =
      await this.balanceRepository.lockBalanceRows(
        tx,
        ledgerAccountIds,
      );

    const balancesById = new Map(
      lockedBalances.map((balance) => [
        balance.ledgerAccountId,
        balance,
      ]),
    );

    for (const ledgerAccountId of ledgerAccountIds) {
      if (!balancesById.has(ledgerAccountId)) {
        throw new BalanceProjectionMissingException(
          ledgerAccountId,
        );
      }
    }

    const updates: BalanceProjectionUpdate[] = [];

    for (const ledgerAccountId of ledgerAccountIds) {
      const movement = movements.get(ledgerAccountId);
      const account = accountsById.get(ledgerAccountId);
      const currentBalance = balancesById.get(ledgerAccountId);

      if (!movement || !account || !currentBalance) {
        throw new BalanceProjectionMissingException(
          ledgerAccountId,
        );
      }

      const netDelta =
        this.balancePolicy.calculateNetDelta(
          account,
          movement,
        );

      const newPostedBalance =
        currentBalance.postedBalance + netDelta;

      this.balancePolicy.validateAvailableBalance(
        account,
        currentBalance,
        newPostedBalance,
      );

      updates.push({
        ledgerAccountId,
        totalDebits:
          currentBalance.totalDebits +
          movement.totalDebits,
        totalCredits:
          currentBalance.totalCredits +
          movement.totalCredits,
        postedBalance: newPostedBalance,
        version: currentBalance.version + 1n,
        lastEntryAt: postedAt,
      });
    }

    await this.balanceRepository.updateBalanceRows(
      tx,
      updates,
    );
  }

  private aggregateEntries(
    entries: BalancePostingEntry[],
    accountsById: Map<string, BalanceAccountContext>,
  ): Map<string, AggregatedAccountMovement> {
    const movements = new Map<
      string,
      AggregatedAccountMovement
    >();

    for (const entry of entries) {
      if (
        entry.direction !== 'DEBIT' &&
        entry.direction !== 'CREDIT'
      ) {
        throw new InvalidBalanceMovementException(
          'Entry direction is invalid.',
        );
      }

      if (entry.amount <= 0n) {
        throw new InvalidBalanceMovementException(
          'Journal entry amounts must be positive.',
        );
      }

      if (!accountsById.has(entry.ledgerAcconntId)) {
        throw new BalanceAccountContextMissingException(
          entry.ledgerAcconntId,
        );
      }

      let movement = movements.get(
        entry.ledgerAcconntId,
      );

      if (!movement) {
        movement = {
          ledgerAccountId: entry.ledgerAcconntId,
          totalDebits: 0n,
          totalCredits: 0n,
        };

        movements.set(
          entry.ledgerAcconntId,
          movement,
        );
      }

      if (entry.direction === 'DEBIT') {
        movement.totalDebits += entry.amount;
      } else {
        movement.totalCredits += entry.amount;
      }
    }

    return movements;
  }
}