import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  userPermissionOverrides,
  type UserPermissionOverride,
} from '../../../infrastructure/database/schema/permission-overrides.schema.js';
import type { Permission } from '../permissions.js';

export interface UpsertPermissionOverrideInput {
  userId: string;
  permission: Permission;
  effect: UserPermissionOverride['effect'];
  actorUserId: string;
  reason?: string | null;
}

@Injectable()
export class PermissionOverridesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async findByUserId(
    userId: string,
    tx?: DatabaseTransaction,
  ): Promise<UserPermissionOverride[]> {
    return this.executor(tx)
      .select()
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId));
  }

  async findByUserAndPermission(
    userId: string,
    permission: Permission,
    tx?: DatabaseTransaction,
  ): Promise<UserPermissionOverride | null> {
    const [override] = await this.executor(tx)
      .select()
      .from(userPermissionOverrides)
      .where(
        and(
          eq(userPermissionOverrides.userId, userId),
          eq(userPermissionOverrides.permission, permission),
        ),
      )
      .limit(1);

    return override ?? null;
  }

  async upsert(
    input: UpsertPermissionOverrideInput,
    tx?: DatabaseTransaction,
  ): Promise<UserPermissionOverride> {
    const [override] = await this.executor(tx)
      .insert(userPermissionOverrides)
      .values({
        userId: input.userId,
        permission: input.permission,
        effect: input.effect,
        actorUserId: input.actorUserId,
        reason: input.reason ?? null,
      })
      .onConflictDoUpdate({
        target: [
          userPermissionOverrides.userId,
          userPermissionOverrides.permission,
        ],
        set: {
          effect: input.effect,
          actorUserId: input.actorUserId,
          reason: input.reason ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!override) {
      throw new Error('Failed to persist permission override');
    }

    return override;
  }

  async delete(
    userId: string,
    permission: Permission,
    tx?: DatabaseTransaction,
  ): Promise<boolean> {
    const deleted = await this.executor(tx)
      .delete(userPermissionOverrides)
      .where(
        and(
          eq(userPermissionOverrides.userId, userId),
          eq(userPermissionOverrides.permission, permission),
        ),
      )
      .returning({ id: userPermissionOverrides.id });

    return deleted.length > 0;
  }

  /**
   * Removes every override for a user. Called inside the role-change
   * transaction so a role change resets the user to that role's baseline.
   */
  async deleteAllForUser(
    userId: string,
    tx?: DatabaseTransaction,
  ): Promise<number> {
    const deleted = await this.executor(tx)
      .delete(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId))
      .returning({ id: userPermissionOverrides.id });

    return deleted.length;
  }
}
