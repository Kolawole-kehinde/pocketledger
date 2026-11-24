import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type { Database, DatabaseTransaction} from '../../../infrastructure/database/database.types.js';
import {
  JournalTransaction,
  journalTransactions,
  LedgerAccount,
  ledgerAccounts,
  ledgerEntries,
  LedgerEntry,
  NewJournalTransaction,
  NewLedgerEntry,
} from '../../../infrastructure/database/schema/index.js';

@Injectable()
export class JournalTransactionRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  /**
   * Fetches ledger accounts matching the supplied IDs.
    Uses the injected database because this is a preliminary read.
   * Missing accounts are handled by the service.
   */
  async findLedgerAccountsByIds(ids: string[]): Promise<LedgerAccount[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(ledgerAccounts)
      .where(inArray(ledgerAccounts.id, ids));
  }

  /**
   * Locks ledger accounts inside an active transaction.
   * Sorting IDs gives concurrent operations a consistent
   * account-locking order and helps reduce deadlocks.
   */
  async lockLedgerAccountsByIds(
    tx: DatabaseTransaction,
    ids: string[],
  ): Promise<LedgerAccount[]> {
    if (ids.length === 0) {
      return [];
    }

    const uniqueIds = [...new Set(ids)];

    return tx
      .select()
      .from(ledgerAccounts)
      .where(inArray(ledgerAccounts.id, uniqueIds))
      .orderBy(asc(ledgerAccounts.id))
      .for('update');
  }

  /**
   * Inserts a journal header inside the supplied transaction.
   */
  async createJournalTransaction(
    tx: DatabaseTransaction,
    data: NewJournalTransaction,
  ): Promise<JournalTransaction | null> {
    const [journal] = await tx
      .insert(journalTransactions)
      .values(data)
      .returning();

    return journal ?? null;
  }

  /**
   * Bulk inserts journal entries inside the supplied transaction.
   */
  async createJournalEntries(
    tx: DatabaseTransaction,
    entries: NewLedgerEntry[],
  ): Promise<LedgerEntry[]> {
    if (entries.length === 0) {
      return [];
    }

    return tx
    .insert(ledgerEntries)
    .values(entries)
    .returning();
  }

  //Marks a journal as posted inside the supplied transaction.
  async markJournalAsPosted(
    tx: DatabaseTransaction,
    journalId: string,
    postedAt: Date,
  ): Promise<JournalTransaction | null> {
    const [journal] = await tx
      .update(journalTransactions)
      .set({
        status: 'POSTED',
        postedAt,
      })
      .where(eq(journalTransactions.id, journalId))
      .returning();

    return journal ?? null;
  }
}
