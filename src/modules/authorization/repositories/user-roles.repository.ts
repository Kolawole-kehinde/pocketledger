import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import { userRoles } from '../../../infrastructure/database/schema/user-roles.schema.js';
import { DEFAULT_ROLE, ROLE_VALUES, normalizeRoles, type Role } from '../roles.js';

@Injectable()
export class UserRolesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async findRoleIdsByUserId(
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

  async replaceRoles(
    userId: string,
    roles: readonly string[],
    tx?: DatabaseTransaction,
  ): Promise<Role[]> {
    const normalized = normalizeRoles(roles);

    await this.executor(tx)
      .delete(userRoles)
      .where(eq(userRoles.userId, userId));

    await this.executor(tx).insert(userRoles).values(
      normalized.map((roleId) => ({
        userId,
        roleId,
      })),
    );

    return normalized;
  }

  async addRoles(
    userId: string,
    roles: readonly string[],
    tx?: DatabaseTransaction,
  ): Promise<Role[]> {
    const normalized = normalizeRoles(roles);

    await this.executor(tx)
      .insert(userRoles)
      .values(normalized.map((roleId) => ({ userId, roleId })))
      .onConflictDoNothing();

    return this.findRoleIdsByUserId(userId, tx);
  }

  async removeRoles(
    userId: string,
    roles: readonly string[],
    tx?: DatabaseTransaction,
  ): Promise<Role[]> {
    const normalized = normalizeRoles(roles);

    await this.executor(tx)
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          inArray(userRoles.roleId, normalized),
        ),
      );

    const remaining = await this.findRoleIdsByUserId(userId, tx);
    if (remaining.length === 0) {
      return this.replaceRoles(userId, [DEFAULT_ROLE], tx);
    }

    return remaining;
  }

  async assignDefaultRole(
    userId: string,
    tx?: DatabaseTransaction,
  ): Promise<void> {
    await this.executor(tx)
      .insert(userRoles)
      .values({ userId, roleId: DEFAULT_ROLE })
      .onConflictDoNothing();
  }

  async countUsersWithRole(
    roleId: Role,
    tx?: DatabaseTransaction,
  ): Promise<number> {
    const rows = await this.executor(tx)
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.roleId, roleId));

    return rows.length;
  }

  listKnownRoles(): readonly Role[] {
    return ROLE_VALUES;
  }
}
