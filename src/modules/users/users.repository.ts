import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';

import { DATABASE } from '../../infrastructure/database/database.provider.js';

import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../infrastructure/database/database.types.js';

import {
  users,
  type NewUser,
  type User,
} from '../../infrastructure/database/schema/users.schema.js';

import type {
  FindUsersOptions,
  UpdateUserData,
  UserListResult,
} from './users.types.js';

// Escapes PostgreSQL LIKE wildcard characters.
// Backslash is escaped first because it is the escape character.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  private executor(
    tx?: DatabaseTransaction,
  ): DatabaseExecutor {
    return tx ?? this.db;
  }

  async create(
    data: NewUser,
    tx: DatabaseTransaction,
  ): Promise<User> {
    const [user] = await this.executor(tx)
      .insert(users)
      .values(data)
      .returning();

    if (!user) {
      throw new Error('Failed to create user');
    }

    return user;
  }

  async findById(
    id: string,
    tx?: DatabaseTransaction,
  ): Promise<User | null> {
    const [user] = await this.executor(tx)
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }

  async countByRole(
    role: User['role'],
    tx?: DatabaseTransaction,
  ): Promise<number> {
    const [result] = await this.executor(tx)
      .select({ total: count() })
      .from(users)
      .where(eq(users.role, role));

    return result?.total ?? 0;
  }

  async findByEmail(
    email: string,
    tx?: DatabaseTransaction,
  ): Promise<User | null> {
    const [user] = await this.executor(tx)
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  }

  async findByUsername(
    username: string,
    tx?: DatabaseTransaction,
  ): Promise<User | null> {
    const [user] = await this.executor(tx)
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return user ?? null;
  }

  async findByPhoneNumber(
    phoneNumber: string,
    tx?: DatabaseTransaction,
  ): Promise<User | null> {
    const [user] = await this.executor(tx)
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    return user ?? null;
  }

  async update(id: string, data: UpdateUserData, tx?: DatabaseTransaction): Promise<User | null> {
    const [user] = await this.executor(tx)
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return user ?? null;
  }

  async updateRole(id: string, role: User['role'],tx?: DatabaseTransaction,): Promise<User | null> {
    const [user] = await this.executor(tx)
      .update(users)
      .set({
        role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return user ?? null;
  }

  async updateStatus(id: string,status: User['status'],tx?: DatabaseTransaction): Promise<User | null> {
    const [user] = await this.executor(tx)
      .update(users)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    return user ?? null;
  }

  async deactivate( id: string, tx?: DatabaseTransaction): Promise<User | null> {
    const [user] = await this.executor(tx)
      .update(users)
      .set({
        status: 'inactive',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, id),
          eq(users.status, 'active'),
        ),
      )
      .returning();

    return user ?? null;
  }

  async findMany( options: FindUsersOptions): Promise<UserListResult> {
  const {
    pageSize,
    offset,
    search,
    role,
    status,
    sortBy,
    sortOrder,
    createdFrom,
    createdTo,
  } = options;

  // Defensively protect the repository from invalid internal calls.
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw new RangeError('Invalid user list page size.');
  }

  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('Invalid user list offset.');
  }

  // Build the filters once so both queries use identical conditions.
  const conditions: SQL[] = [];

  if (search) {
    const searchPattern = `%${escapeLikePattern(search)}%`;

    const searchCondition = or(
      ilike(users.email, searchPattern),
      ilike(users.firstName, searchPattern),
      ilike(users.lastName, searchPattern),
      ilike(users.username, searchPattern),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (role) {
    conditions.push(eq(users.role, role));
  }

  if (status) {
    conditions.push(eq(users.status, status));
  }

  if (createdFrom) {
    conditions.push(
      gte(users.createdAt, new Date(createdFrom)),
    );
  }

  if (createdTo) {
    conditions.push(
      lte(users.createdAt, new Date(createdTo)),
    );
  }

  const whereCondition =
    conditions.length > 0
      ? and(...conditions)
      : undefined;

  // Never use an untrusted string as a database column.
  const sortColumns = {
    createdAt: users.createdAt,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
  } as const;

  const sortColumn = sortColumns[sortBy];

  const primaryOrder =
    sortOrder === 'asc'
      ? asc(sortColumn)
      : desc(sortColumn);

  // The unique ID provides deterministic ordering.
  const ordering = [
    primaryOrder,
    asc(users.id),
  ];

  return this.db.transaction(
    async (tx) => {
      const [data, countResult] = await Promise.all([
        tx
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            username: users.username,
            email: users.email,
            role: users.role,
            status: users.status,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(whereCondition)
          .orderBy(...ordering)
          .limit(pageSize)
          .offset(offset),

        tx
          .select({
            total: count(),
          })
          .from(users)
          .where(whereCondition),
      ]);

      return {
  data,
  total: countResult[0]?.total ?? 0,
};
    },
    {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    },
  );
}
}