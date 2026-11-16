import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
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
import { userRoles } from '../../infrastructure/database/schema/user-roles.schema.js';
import { DEFAULT_ROLE, normalizeRoles, type Role } from '../authorization/roles.js';
import type {
  FindUsersOptions,
  UpdateUserData,
  UserListItem,
  UserListResult,
} from './users.types.js';

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class UsersRepository {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async create(data: NewUser, tx: DatabaseTransaction): Promise<User> {
    const [user] = await this.executor(tx).insert(users).values(data).returning();

    if (!user) {
      throw new Error('Failed to create user');
    }

    return user;
  }

  async findById(id: string, tx?: DatabaseTransaction): Promise<User | null> {
    const [user] = await this.executor(tx)
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }

  async findByIdWithRoles(
    id: string,
    tx?: DatabaseTransaction,
  ): Promise<(User & { roles: Role[] }) | null> {
    const user = await this.findById(id, tx);
    if (!user) return null;
    const roles = await this.findRolesByUserId(id, tx);
    return { ...user, roles };
  }

  async findRolesByUserId(
    userId: string,
    tx?: DatabaseTransaction,
  ): Promise<Role[]> {
    const rows = await this.executor(tx)
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    if (rows.length === 0) {
      return [DEFAULT_ROLE];
    }

    return normalizeRoles(rows.map((row) => row.roleId));
  }

  async findByEmail(email: string, tx?: DatabaseTransaction): Promise<User | null> {
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

  async update(
    id: string,
    data: UpdateUserData,
    tx?: DatabaseTransaction,
  ): Promise<User | null> {
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

  async updateStatus(
    id: string,
    status: User['status'],
    tx?: DatabaseTransaction,
  ): Promise<User | null> {
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

  async findMany(options: FindUsersOptions): Promise<UserListResult> {
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

    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new RangeError('Invalid user list page size.');
    }

    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError('Invalid user list offset.');
    }

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
      conditions.push(
        exists(
          this.db
            .select({ one: users.id })
            .from(userRoles)
            .where(
              and(
                eq(userRoles.userId, users.id),
                eq(userRoles.roleId, role),
              ),
            ),
        ),
      );
    }

    if (status) {
      conditions.push(eq(users.status, status));
    }

    if (createdFrom) {
      conditions.push(gte(users.createdAt, new Date(createdFrom)));
    }

    if (createdTo) {
      conditions.push(lte(users.createdAt, new Date(createdTo)));
    }

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumns = {
      createdAt: users.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    } as const;

    const sortColumn = sortColumns[sortBy];
    const primaryOrder = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const ordering = [primaryOrder, asc(users.id)];

    return this.db.transaction(
      async (tx) => {
        const [rows, countResult] = await Promise.all([
          tx
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              username: users.username,
              email: users.email,
              status: users.status,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(whereCondition)
            .orderBy(...ordering)
            .limit(pageSize)
            .offset(offset),
          tx.select({ total: count() }).from(users).where(whereCondition),
        ]);

        const ids = rows.map((row) => row.id);
        const roleRows =
          ids.length === 0
            ? []
            : await tx
                .select({ userId: userRoles.userId, roleId: userRoles.roleId })
                .from(userRoles)
                .where(inArray(userRoles.userId, ids));

        const rolesByUser = new Map<string, Role[]>();
        for (const row of roleRows) {
          const list = rolesByUser.get(row.userId) ?? [];
          list.push(row.roleId as Role);
          rolesByUser.set(row.userId, list);
        }

        const data: UserListItem[] = rows.map((row) => ({
          ...row,
          roles: normalizeRoles(rolesByUser.get(row.id) ?? [DEFAULT_ROLE]),
        }));

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
