import { asc, inArray, sql } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../../infrastructure/database/database.types.js';
import type {
  BalanceProjection,
  BalanceProjectionUpdate,
} from '../types/balance.types.js';
import { BalanceProjectionMissingException } from '../errors/balance.errors.js';
import { Injectable } from '@nestjs/common';
import { ledgerAccountBalances } from '../../../infrastructure/database/schema/index.js';

@Injectable()
export class BalanceRepository {
    
  async ensureBalanceRows(
    tx: DatabaseTransaction,
    ledgerAccountIds: string[],
  ): Promise<void> {
    if (ledgerAccountIds.length === 0) {
      return;
    }

    await tx
      .insert(ledgerAccountBalances)
      .values(
        ledgerAccountIds.map((ledgerAccountId) => ({
          ledgerAccountId,
          totalDebits: '0',
          totalCredits: '0',
          postedBalance: '0',
          heldAmount: '0',
          version: 0n,
        })),
      )
      .onConflictDoNothing({
        target: ledgerAccountBalances.ledgerAccountId,
      });
  }

  async lockBalanceRows(
    tx: DatabaseTransaction,
    ledgerAccountIds: string[],
  ): Promise<BalanceProjection[]> {
    if (ledgerAccountIds.length === 0) {
      return [];
    }

    const rows = await tx
      .select()
      .from(ledgerAccountBalances)
      .where(inArray(ledgerAccountBalances.ledgerAccountId, ledgerAccountIds))
      .orderBy(asc(ledgerAccountBalances.ledgerAccountId))
      .for('update');

    return rows.map((row) => ({
      ledgerAccountId: row.ledgerAccountId,
      totalDebits: BigInt(row.totalDebits),
      totalCredits: BigInt(row.totalCredits),
      postedBalance: BigInt(row.postedBalance),
      heldAmount: BigInt(row.heldAmount),
      version: row.version,
      lastEntryAt: row.lastEntryAt,
    }));
  }

  async updateBalanceRows(
    tx: DatabaseTransaction,
    updates: BalanceProjectionUpdate[],
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    const sortedUpdates = [...updates].sort((a, b) =>
      a.ledgerAccountId.localeCompare(b.ledgerAccountId),
    );

    const ids = sortedUpdates.map((update) => update.ledgerAccountId);

    const buildCase = (
      column: typeof ledgerAccountBalances.ledgerAccountId,
      values: (string | bigint | Date)[],
    ) => sql`
      CASE ${column}
      ${sql.join(
        sortedUpdates.map(
          (update, index) => sql`
            WHEN ${update.ledgerAccountId}
            THEN ${values[index]}
          `,
        ),
        sql` `,
      )}
      END
    `;

    const totalDebitsCase = buildCase(
      ledgerAccountBalances.ledgerAccountId,
      sortedUpdates.map((update) => update.totalDebits.toString()),
    );

    const totalCreditsCase = buildCase(
      ledgerAccountBalances.ledgerAccountId,
      sortedUpdates.map((update) => update.totalCredits.toString()),
    );

    const postedBalanceCase = buildCase(
      ledgerAccountBalances.ledgerAccountId,
      sortedUpdates.map((update) => update.postedBalance.toString()),
    );

    const versionCase = buildCase(
      ledgerAccountBalances.ledgerAccountId,
      sortedUpdates.map((update) => update.version),
    );

    const lastEntryAtCase = buildCase(
      ledgerAccountBalances.ledgerAccountId,
      sortedUpdates.map((update) => update.lastEntryAt),
    );

    await tx
      .update(ledgerAccountBalances)
      .set({
        totalDebits: totalDebitsCase,
        totalCredits: totalCreditsCase,
        postedBalance: postedBalanceCase,
        version: versionCase,
        lastEntryAt: lastEntryAtCase,
        updatedAt: sql`now()`,
      })
      .where(inArray(ledgerAccountBalances.ledgerAccountId, ids));

    // Verify the expected rows still exist.
    // They should already have been locked by the caller.
    const verification = await tx
      .select({
        ledgerAccountId: ledgerAccountBalances.ledgerAccountId,
      })
      .from(ledgerAccountBalances)
      .where(inArray(ledgerAccountBalances.ledgerAccountId, ids));

    const updatedIds = new Set(verification.map((row) => row.ledgerAccountId));

    for (const id of ids) {
      if (!updatedIds.has(id)) {
        throw new BalanceProjectionMissingException(id);
      }
    }
  }
}
