import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { asc, eq, inArray, like } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseModule } from '../../../infrastructure/database/database.module.js';
import {
  DATABASE,
  DATABASE_POOL,
} from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  chartOfAccounts,
  currencies,
  journalTransactions,
  ledgerAccounts,
  ledgerEntries,
  systemAccountDefinitions,
  type LedgerAccount,
  type NewJournalTransaction,
  type NewLedgerEntry,
} from '../../../infrastructure/database/schema/index.js';
import { JournalTransactionRepository } from '../repositories/journal-transaction.repository.js';
import type {
  CreateJournalEntryInput,
  CreateJournalPostingInput,
} from '../types/journal.types.js';
import { JournalTransactionService } from './journal-transaction.service.js';

// Vitest does not load the application's .env file; follow the convention
// already used by the project's other integration tests.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const TEST_DATABASE_NAME = 'pocketledger_test_db';

function assertTestDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error(
      'TEST_DATABASE_URL is required for the JournalTransactionService integration tests.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid connection URL.');
  }

  if (
    parsed.protocol !== 'postgresql:' ||
    parsed.pathname !== `/${TEST_DATABASE_NAME}`
  ) {
    throw new Error(
      `Refusing to run integration tests: TEST_DATABASE_URL must target exactly ${TEST_DATABASE_NAME}.`,
    );
  }

  return value;
}

const testDatabaseUrl = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const runId = randomUUID();

type AccountStatus = LedgerAccount['status'];

/**
 * Test-only instrumentation around the real repository. Every database
 * operation still runs through the real repository/drizzle implementation;
 * hooks only create deterministic race / failure points.
 */
interface RepositoryHooks {
  beforeLock?: (accounts: LedgerAccount[]) => Promise<void> | void;
  afterLock?: () => void;
  gate?: Promise<void>;
  failAt?: 'entries' | 'posting';
  onHeaderCreated?: (journalId: string) => void;
}

class InstrumentedRepository extends JournalTransactionRepository {
  constructor(
    db: Database,
    private readonly hooks: RepositoryHooks = {},
  ) {
    super(db);
  }

  override async findLedgerAccountsByIds(ids: string[]) {
    const accounts = await super.findLedgerAccountsByIds(ids);
    if (this.hooks.beforeLock) {
      await this.hooks.beforeLock(accounts);
    }
    return accounts;
  }

  override async lockLedgerAccountsByIds(
    tx: DatabaseTransaction,
    ids: string[],
  ) {
    const accounts = await super.lockLedgerAccountsByIds(tx, ids);
    this.hooks.afterLock?.();
    if (this.hooks.gate) {
      await this.hooks.gate;
    }
    return accounts;
  }

  override async createJournalTransaction(
    tx: DatabaseTransaction,
    data: NewJournalTransaction,
  ) {
    const journal = await super.createJournalTransaction(tx, data);
    if (journal) {
      this.hooks.onHeaderCreated?.(journal.id);
    }
    return journal;
  }

  override async createJournalEntries(
    tx: DatabaseTransaction,
    entries: NewLedgerEntry[],
  ) {
    if (this.hooks.failAt === 'entries') {
      throw new Error('test-only failure after journal header creation');
    }
    return super.createJournalEntries(tx, entries);
  }

  override async markJournalAsPosted(
    tx: DatabaseTransaction,
    journalId: string,
    postedAt: Date,
  ) {
    if (this.hooks.failAt === 'posting') {
      throw new Error('test-only failure after journal entry creation');
    }
    return super.markJournalAsPosted(tx, journalId, postedAt);
  }
}

describe('JournalTransactionService (PostgreSQL integration)', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let pool: Pool;
  let service: JournalTransactionService;

  const createdCurrencyIds: string[] = [];
  const createdChartAccountIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          // The actual DatabaseModule provider is used, but pointed at the
          // dedicated test database instead of the development database.
          load: [() => ({ DATABASE_URL: testDatabaseUrl })],
        }),
        DatabaseModule,
      ],
      providers: [JournalTransactionRepository, JournalTransactionService],
    }).compile();

    db = moduleRef.get<Database>(DATABASE);
    pool = moduleRef.get<Pool>(DATABASE_POOL);
    service = moduleRef.get(JournalTransactionService);

    const connected = await pool.query<{ name: string }>(
      'SELECT current_database() AS name',
    );

    if (connected.rows[0]?.name !== TEST_DATABASE_NAME) {
      throw new Error(
        `Refusing to continue: connected database is not ${TEST_DATABASE_NAME}.`,
      );
    }
  });

  afterAll(async () => {
    if (!moduleRef) {
      return;
    }

    // Re-verify immediately before any destructive cleanup.
    const connected = await pool.query<{ name: string }>(
      'SELECT current_database() AS name',
    );

    if (connected.rows[0]?.name !== TEST_DATABASE_NAME) {
      throw new Error(
        `Refusing cleanup: connected database is not ${TEST_DATABASE_NAME}.`,
      );
    }

    const journals = await db
      .select({ id: journalTransactions.id })
      .from(journalTransactions)
      .where(like(journalTransactions.sourceReference, `jti-${runId}%`));

    const journalIds = journals.map((journal) => journal.id);

    if (journalIds.length > 0) {
      await db
        .delete(ledgerEntries)
        .where(inArray(ledgerEntries.journalTransactionId, journalIds));
      await db
        .delete(journalTransactions)
        .where(inArray(journalTransactions.id, journalIds));
    }

    if (createdAccountIds.length > 0) {
      await db
        .delete(ledgerAccounts)
        .where(inArray(ledgerAccounts.id, createdAccountIds));
    }
    if (createdDefinitionIds.length > 0) {
      await db
        .delete(systemAccountDefinitions)
        .where(inArray(systemAccountDefinitions.id, createdDefinitionIds));
    }
    if (createdChartAccountIds.length > 0) {
      await db
        .delete(chartOfAccounts)
        .where(inArray(chartOfAccounts.id, createdChartAccountIds));
    }
    if (createdCurrencyIds.length > 0) {
      await db
        .delete(currencies)
        .where(inArray(currencies.id, createdCurrencyIds));
    }

    await pool.end();
    await moduleRef.close();
  });

  async function createCurrency(): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = Array.from(randomBytes(3), (byte) =>
        String.fromCharCode(65 + (byte % 26)),
      ).join('');

      const existing = await db
        .select({ code: currencies.code })
        .from(currencies)
        .where(eq(currencies.code, code))
        .limit(1);

      if (existing.length > 0) {
        continue;
      }

      const [currency] = await db
        .insert(currencies)
        .values({
          id: randomUUID(),
          code,
          name: `Integration test currency ${code}`,
          minorUnit: 2,
        })
        .returning();

      createdCurrencyIds.push(currency.id);
      return currency.code;
    }

    throw new Error('Could not allocate a unique test currency code.');
  }

  async function createAccount(options: {
    currencyCode?: string;
    status?: AccountStatus;
  } = {}): Promise<LedgerAccount> {
    const currencyCode = options.currencyCode ?? (await createCurrency());

    const [chartAccount] = await db
      .insert(chartOfAccounts)
      .values({
        id: randomUUID(),
        code: `JTI-COA-${randomUUID()}`,
        name: 'Integration test chart account',
        accountType: 'ASSETS',
        normalBalance: 'DEBIT',
      })
      .returning();
    createdChartAccountIds.push(chartAccount.id);

    const [definition] = await db
      .insert(systemAccountDefinitions)
      .values({
        id: randomUUID(),
        code: `JTI-SAD-${randomUUID()}`,
        name: 'Integration test system account',
        chartAccountId: chartAccount.id,
      })
      .returning();
    createdDefinitionIds.push(definition.id);

    const [account] = await db
      .insert(ledgerAccounts)
      .values({
        id: randomUUID(),
        chartAccountId: chartAccount.id,
        ownerType: 'SYSTEM',
        systemAccountDefinitionId: definition.id,
        currency: currencyCode,
        status: options.status ?? 'ACTIVE',
      })
      .returning();
    createdAccountIds.push(account.id);

    return account;
  }

  function buildInput(
    entries: CreateJournalEntryInput[],
    overrides: Partial<CreateJournalPostingInput> = {},
  ): CreateJournalPostingInput {
    return {
      sourceModule: 'JOURNAL_INTEGRATION_TEST',
      sourceReference: `jti-${runId}-${randomUUID()}`,
      postingPurpose: 'TEST_POSTING',
      transactionType: 'ADJUSTMENT',
      entries,
      ...overrides,
    };
  }

  function errorCodes(error: unknown): string[] {
    if (
      !(
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
    ) {
      return [];
    }

    const response = error.getResponse() as unknown;

    if (Array.isArray(response)) {
      return response
        .map((item) => (item as { code?: string }).code)
        .filter((code): code is string => Boolean(code));
    }

    if (response && typeof response === 'object') {
      const body = response as {
        code?: string;
        message?: unknown;
      };

      if (body.code) {
        return [body.code];
      }

      if (Array.isArray(body.message)) {
        return body.message
          .map((item) => (item as { code?: string }).code)
          .filter((code): code is string => Boolean(code));
      }
    }

    return [];
  }

  async function expectRejectedWith(
    posting: Promise<unknown>,
    expected: new (...args: never[]) => Error,
    codes: string[] = [],
  ): Promise<void> {
    let caught: unknown;

    try {
      await posting;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(expected);
    if (codes.length > 0) {
      expect(errorCodes(caught)).toEqual(expect.arrayContaining(codes));
    }
  }

  async function expectNoJournalPersisted(
    input: CreateJournalPostingInput,
  ): Promise<void> {
    const journals = await db
      .select()
      .from(journalTransactions)
      .where(eq(journalTransactions.sourceReference, input.sourceReference));

    expect(journals).toHaveLength(0);

    const knownAccountIds = input.entries
      .map((entry) => entry.ledgerAccountId)
      .filter((id) => createdAccountIds.includes(id));

    if (knownAccountIds.length > 0) {
      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(inArray(ledgerEntries.ledgerAccountId, knownAccountIds));

      expect(entries).toHaveLength(0);
    }
  }

  describe('A. successful journal posting', () => {
    it('posts a balanced journal and persists the header and all entries', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 12_500n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 12_500n,
        },
      ]);

      const result = await service.createPostingJournal(input);

      expect(result.status).toBe('POSTED');
      expect(result.postedAt).toBeInstanceOf(Date);
      expect(result.currency).toBe(debitAccount.currency);

      const [header] = await db
        .select()
        .from(journalTransactions)
        .where(eq(journalTransactions.id, result.id));

      expect(header).toBeDefined();
      expect(header.reference).toBe(`JRN-${result.id}`);
      expect(header.status).toBe('POSTED');
      expect(header.transactionType).toBe(input.transactionType);
      expect(header.sourceModule).toBe(input.sourceModule);
      expect(header.sourceReference).toBe(input.sourceReference);
      expect(header.postingPurpose).toBe(input.postingPurpose);
      expect(header.currency).toBe(debitAccount.currency);

      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.journalTransactionId, result.id))
        .orderBy(asc(ledgerEntries.sequenceNumber));

      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => entry.entryType)).toEqual([
        'DEBIT',
        'CREDIT',
      ]);
      expect(entries.map((entry) => entry.amount)).toEqual([12_500n, 12_500n]);
      expect(entries.map((entry) => entry.currency)).toEqual([
        debitAccount.currency,
        debitAccount.currency,
      ]);
      expect(entries.map((entry) => entry.sequenceNumber)).toEqual([1, 2]);
      expect(entries.map((entry) => entry.ledgerAccountId)).toEqual([
        debitAccount.id,
        creditAccount.id,
      ]);
      expect(
        entries.every(
          (entry) => entry.journalTransactionId === result.id,
        ),
      ).toBe(true);
    });
  });

  describe('B. missing accounts', () => {
    it('rejects a journal referencing a nonexistent account and persists nothing', async () => {
      const existingAccount = await createAccount();
      const missingAccountId = randomUUID();

      const input = buildInput([
        {
          ledgerAccountId: existingAccount.id,
          direction: 'DEBIT',
          amount: 5_000n,
        },
        {
          ledgerAccountId: missingAccountId,
          direction: 'CREDIT',
          amount: 5_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        NotFoundException,
      );

      await expectNoJournalPersisted(input);
    });
  });

  describe('C. account status rules', () => {
    it('allows an ACTIVE account to be debited', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 1_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 1_000n,
        },
      ]);

      const result = await service.createPostingJournal(input);

      expect(result.status).toBe('POSTED');
    });

    it('allows an ACTIVE account to be credited', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 2_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 2_000n,
        },
      ]);

      const result = await service.createPostingJournal(input);

      expect(result.status).toBe('POSTED');

      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.journalTransactionId, result.id));

      expect(entries.find((entry) => entry.ledgerAccountId === creditAccount.id))
        .toMatchObject({ entryType: 'CREDIT', amount: 2_000n });
    });

    it('rejects a debit from a FROZEN account without persisting anything', async () => {
      const frozenAccount = await createAccount({ status: 'FROZEN' });
      const creditAccount = await createAccount({
        currencyCode: frozenAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: frozenAccount.id,
          direction: 'DEBIT',
          amount: 3_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 3_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        ConflictException,
        ['ACCOUNT_FROZEN'],
      );

      await expectNoJournalPersisted(input);
    });

    it('allows a credit to a FROZEN account', async () => {
      const debitAccount = await createAccount();
      const frozenCreditAccount = await createAccount({
        currencyCode: debitAccount.currency,
        status: 'FROZEN',
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 4_000n,
        },
        {
          ledgerAccountId: frozenCreditAccount.id,
          direction: 'CREDIT',
          amount: 4_000n,
        },
      ]);

      const result = await service.createPostingJournal(input);

      expect(result.status).toBe('POSTED');
    });

    it('rejects a debit from a CLOSED account without persisting anything', async () => {
      const closedAccount = await createAccount({ status: 'CLOSED' });
      const creditAccount = await createAccount({
        currencyCode: closedAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: closedAccount.id,
          direction: 'DEBIT',
          amount: 5_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 5_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        ConflictException,
        ['ACCOUNT_CLOSED'],
      );

      await expectNoJournalPersisted(input);
    });

    it('rejects a credit to a CLOSED account without persisting anything', async () => {
      const debitAccount = await createAccount();
      const closedAccount = await createAccount({
        currencyCode: debitAccount.currency,
        status: 'CLOSED',
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 6_000n,
        },
        {
          ledgerAccountId: closedAccount.id,
          direction: 'CREDIT',
          amount: 6_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        ConflictException,
        ['ACCOUNT_CLOSED'],
      );

      await expectNoJournalPersisted(input);
    });
  });

  describe('D. journal accounting validation', () => {
    it('rejects an unbalanced journal without persisting anything', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 10_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 9_999n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        BadRequestException,
        ['JOURNAL_NOT_BALANCED'],
      );

      await expectNoJournalPersisted(input);
    });

    it('rejects a journal with fewer than two entries', async () => {
      const account = await createAccount();

      const input = buildInput([
        {
          ledgerAccountId: account.id,
          direction: 'DEBIT',
          amount: 1_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        BadRequestException,
        ['INSUFFICIENT_ENTRIES', 'MISSING_CREDIT_ENTRY'],
      );

      await expectNoJournalPersisted(input);
    });

    it('rejects a journal without a debit entry', async () => {
      const first = await createAccount();
      const second = await createAccount({ currencyCode: first.currency });

      const input = buildInput([
        {
          ledgerAccountId: first.id,
          direction: 'CREDIT',
          amount: 1_000n,
        },
        {
          ledgerAccountId: second.id,
          direction: 'CREDIT',
          amount: 1_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        BadRequestException,
        ['MISSING_DEBIT_ENTRY'],
      );

      await expectNoJournalPersisted(input);
    });

    it('rejects a journal without a credit entry', async () => {
      const first = await createAccount();
      const second = await createAccount({ currencyCode: first.currency });

      const input = buildInput([
        {
          ledgerAccountId: first.id,
          direction: 'DEBIT',
          amount: 1_000n,
        },
        {
          ledgerAccountId: second.id,
          direction: 'DEBIT',
          amount: 1_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        BadRequestException,
        ['MISSING_CREDIT_ENTRY'],
      );

      await expectNoJournalPersisted(input);
    });

    it('rejects zero entry amounts', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 0n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 0n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        BadRequestException,
        ['INVALID_ENTRY_AMOUNT'],
      );

      await expectNoJournalPersisted(input);
    });

    it('rejects negative entry amounts', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: -1_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: -1_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        BadRequestException,
        ['INVALID_ENTRY_AMOUNT'],
      );

      await expectNoJournalPersisted(input);
    });

    it('rejects mixed-currency entries without persisting anything', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount();

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 2_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 2_000n,
        },
      ]);

      await expectRejectedWith(
        service.createPostingJournal(input),
        BadRequestException,
        ['MIXED_CURRENCIES'],
      );

      await expectNoJournalPersisted(input);
    });
  });

  describe('E. transaction atomicity and rollback', () => {
    it('rolls back the created header when entry creation fails', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      let createdHeaderId: string | undefined;

      const repository = new InstrumentedRepository(db, {
        failAt: 'entries',
        onHeaderCreated: (journalId) => {
          createdHeaderId = journalId;
        },
      });
      const instrumentedService = new JournalTransactionService(
        db,
        repository,
      );

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 7_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 7_000n,
        },
      ]);

      await expectRejectedWith(
        instrumentedService.createPostingJournal(input),
        Error,
      );

      // The test-only hook proves the header insert really happened before
      // the failure inside the same real transaction.
      expect(createdHeaderId).toBeDefined();

      const [header] = await db
        .select()
        .from(journalTransactions)
        .where(eq(journalTransactions.id, createdHeaderId!));

      expect(header).toBeUndefined();

      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(inArray(ledgerEntries.ledgerAccountId, [debitAccount.id, creditAccount.id]));

      expect(entries).toHaveLength(0);
      await expectNoJournalPersisted(input);
    });

    it('rolls back entries and the POSTED update when posting fails', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      let createdHeaderId: string | undefined;

      const repository = new InstrumentedRepository(db, {
        failAt: 'posting',
        onHeaderCreated: (journalId) => {
          createdHeaderId = journalId;
        },
      });
      const instrumentedService = new JournalTransactionService(
        db,
        repository,
      );

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 8_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 8_000n,
        },
      ]);

      await expectRejectedWith(
        instrumentedService.createPostingJournal(input),
        Error,
      );

      expect(createdHeaderId).toBeDefined();

      const [header] = await db
        .select()
        .from(journalTransactions)
        .where(eq(journalTransactions.id, createdHeaderId!));

      expect(header).toBeUndefined();

      const entries = await db
        .select()
        .from(ledgerEntries)
        .where(inArray(ledgerEntries.ledgerAccountId, [debitAccount.id, creditAccount.id]));

      expect(entries).toHaveLength(0);
      await expectNoJournalPersisted(input);
    });
  });

  describe('F. account locking', () => {
    it('holds a real FOR UPDATE row lock in the transaction and validates freshly locked status', async () => {
      const debitAccount = await createAccount();
      const creditAccount = await createAccount({
        currencyCode: debitAccount.currency,
      });

      let releaseLock!: () => void;
      let lockReached!: () => void;

      const gate = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      const observedLock = new Promise<void>((resolve) => {
        lockReached = resolve;
      });

      let statusSeenBeforeLock: AccountStatus | undefined;

      const repository = new InstrumentedRepository(db, {
        beforeLock: async (accounts) => {
          statusSeenBeforeLock = accounts.find(
            (account) => account.id === debitAccount.id,
          )?.status;

          // Change the stored status after the preliminary read but before
          // the service locks the rows. The service must honour this value.
          await db
            .update(ledgerAccounts)
            .set({ status: 'CLOSED' })
            .where(eq(ledgerAccounts.id, debitAccount.id));
        },
        afterLock: () => lockReached(),
        gate,
      });

      const instrumentedService = new JournalTransactionService(
        db,
        repository,
      );

      const input = buildInput([
        {
          ledgerAccountId: debitAccount.id,
          direction: 'DEBIT',
          amount: 9_000n,
        },
        {
          ledgerAccountId: creditAccount.id,
          direction: 'CREDIT',
          amount: 9_000n,
        },
      ]);

      const posting = instrumentedService.createPostingJournal(input);

      // Observe the rejection immediately so a failure during the observer
      // phase cannot leave an unhandled rejection while we clean up.
      const postingSettled = posting.then(
        () => undefined,
        (error: unknown) => error,
      );

      await observedLock;

      let observerFailed = false;
      let observerFailure: unknown;

      try {
        // A separate real PostgreSQL connection cannot obtain the same row
        // lock while the service transaction is still open. Construction is
        // inside the protected block so even a synchronous constructor failure
        // still releases the gate.
        const observerPool = new Pool({
          connectionString: testDatabaseUrl,
          max: 1,
        });

        try {
          await expect(
            observerPool.query(
              'SELECT id FROM ledger_accounts WHERE id = $1 FOR UPDATE NOWAIT',
              [debitAccount.id],
            ),
          ).rejects.toMatchObject({ code: '55P03' });
        } catch (error) {
          observerFailed = true;
          observerFailure = error;
        } finally {
          await observerPool.end();
        }
      } catch (error) {
        // Keep the first failure: a pool cleanup error must not mask the
        // original observer assertion/query or pool construction error.
        if (!observerFailed) {
          observerFailed = true;
          observerFailure = error;
        }
      } finally {
        releaseLock();
      }

      // The gate is now open on every path. Always wait for the transaction
      // to finish so no promise is left pending after the observer phase.
      await postingSettled;

      // Surface the original observer failure instead of letting the posting
      // outcome replace it.
      if (observerFailed) {
        throw observerFailure;
      }

      await expectRejectedWith(posting, ConflictException, [
        'ACCOUNT_CLOSED',
      ]);

      expect(statusSeenBeforeLock).toBe('ACTIVE');
      await expectNoJournalPersisted(input);
    }, 15_000);
  });
});
