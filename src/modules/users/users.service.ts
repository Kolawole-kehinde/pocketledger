import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DATABASE } from '../../infrastructure/database/database.provider.js';
import type { Database } from '../../infrastructure/database/database.types.js';
import type { User } from '../../infrastructure/database/schema/users.schema.js';
import { AuthAuditRepository } from '../auth/repositories/auth-audit.repository.js';
import { getUserUniqueField } from '../auth/utils/postgres-error.js';
import {
  DEFAULT_ROLE,
  ROLES,
  normalizeRoles,
  type Role,
} from '../authorization/roles.js';
import { isPermission, type Permission } from '../authorization/permissions.js';
import { PermissionOverridesRepository } from '../authorization/repositories/permission-overrides.repository.js';
import { UserRolesRepository } from '../authorization/repositories/user-roles.repository.js';
import { PermissionCacheService } from '../authorization/services/permission-cache.service.js';
import { UsersRepository } from './users.repository.js';
import type {
  AdminActionMetadata,
  PaginatedUsers,
  UpdateUserData,
  UserListFilters,
  UserPermissionState,
  UserTransaction,
} from './users.types.js';

const MAX_USER_LIST_OFFSET = 100_000;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly usersRepository: UsersRepository,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly permissionOverridesRepository: PermissionOverridesRepository,
    private readonly userRolesRepository: UserRolesRepository,
    private readonly authAuditRepository: AuthAuditRepository,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.usersRepository.findByEmail(normalizedEmail);
  }

  async findById(id: string): Promise<User & { roles: Role[] }> {
    const user = await this.usersRepository.findByIdWithRoles(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, data: UpdateUserData): Promise<User & { roles: Role[] }> {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'At least one field must be provided for update',
      );
    }

    try {
      const updatedUser = await this.usersRepository.update(id, data);

      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      return this.findById(id);
    } catch (error) {
      const conflictingField = getUserUniqueField(error);

      if (conflictingField) {
        throw new ConflictException({
          code: 'USER_FIELD_TAKEN',
          message: `This ${conflictingField} is already in use`,
        });
      }

      throw error;
    }
  }

  async assignRole(
    actorId: string,
    targetUserId: string,
    role: Role,
    metadata: AdminActionMetadata = {},
  ): Promise<User & { roles: Role[] }> {
    return this.changeRoles(
      actorId,
      targetUserId,
      async (existingRoles, tx) => {
        const next = normalizeRoles([...existingRoles, role]);
        await this.userRolesRepository.replaceRoles(targetUserId, next, tx);
        return { previousRoles: existingRoles, nextRoles: next, operation: 'assigned' as const };
      },
      metadata,
    );
  }

  async updateRole(
    actorId: string,
    targetUserId: string,
    role: Role,
    metadata: AdminActionMetadata = {},
  ): Promise<User & { roles: Role[] }> {
    return this.changeRoles(
      actorId,
      targetUserId,
      async (existingRoles, tx) => {
        const next = normalizeRoles([role]);
        await this.userRolesRepository.replaceRoles(targetUserId, next, tx);
        return { previousRoles: existingRoles, nextRoles: next, operation: 'updated' as const };
      },
      metadata,
    );
  }

  async removeRole(
    actorId: string,
    targetUserId: string,
    metadata: AdminActionMetadata = {},
  ): Promise<User & { roles: Role[] }> {
    return this.changeRoles(
      actorId,
      targetUserId,
      async (existingRoles, tx) => {
        const onlyDefault =
          existingRoles.length === 1 && existingRoles[0] === DEFAULT_ROLE;
        if (onlyDefault) {
          throw new BadRequestException({
            code: 'ROLE_ALREADY_REMOVED',
            message: `The user already has the default ${DEFAULT_ROLE} role`,
          });
        }

        const next = [DEFAULT_ROLE] as Role[];
        await this.userRolesRepository.replaceRoles(targetUserId, next, tx);
        return { previousRoles: existingRoles, nextRoles: next, operation: 'removed' as const };
      },
      metadata,
    );
  }

  async updateStatus(
    actorId: string,
    targetUserId: string,
    status: User['status'],
    metadata: AdminActionMetadata = {},
  ): Promise<User & { roles: Role[] }> {
    this.assertNotSelf(
      actorId,
      targetUserId,
      'CANNOT_CHANGE_OWN_STATUS',
      'You cannot change your own account status',
    );

    await this.db.transaction(async (tx) => {
      const existing = await this.usersRepository.findById(targetUserId, tx);

      if (!existing) {
        throw new NotFoundException('User not found');
      }

      if (existing.status === status) {
        return existing;
      }

      const updated = await this.usersRepository.updateStatus(
        targetUserId,
        status,
        tx,
      );

      if (!updated) {
        throw new NotFoundException('User not found');
      }

      await this.authAuditRepository.recordSecurityEvent(
        {
          type:
            updated.status === 'active'
              ? 'account_reactivated'
              : 'account_suspended',
          severity: updated.status === 'active' ? 'medium' : 'high',
          userId: targetUserId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          metadata: {
            actorId,
            previousStatus: existing.status,
            newStatus: updated.status,
          },
        },
        tx,
      );

      return updated;
    });

    this.permissionCacheService.invalidateUser(targetUserId);
    return this.findById(targetUserId);
  }

  async listUsers(filters: UserListFilters): Promise<PaginatedUsers> {
    const { page, pageSize } = filters;
    const offset = (page - 1) * pageSize;

    if (!Number.isSafeInteger(offset) || offset > MAX_USER_LIST_OFFSET) {
      throw new BadRequestException(
        'Requested page exceeds the maximum supported offset.',
      );
    }

    const { data, total } = await this.usersRepository.findMany({
      ...filters,
      offset,
    });

    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && page <= totalPages,
      },
    };
  }

  async getPermissionState(userId: string): Promise<UserPermissionState> {
    const user = await this.findById(userId);

    const [effectivePermissions, overrides] = await Promise.all([
      this.permissionCacheService.getPermissions(user.id, user.roles),
      this.permissionOverridesRepository.findByUserId(user.id),
    ]);

    return {
      user,
      permissions: [...effectivePermissions].sort(),
      overrides,
    };
  }

  async grantPermission(
    actorId: string,
    targetUserId: string,
    permission: string,
    reason?: string,
    metadata: AdminActionMetadata = {},
  ): Promise<UserPermissionState> {
    const validPermission = this.requirePermission(permission);

    this.assertNotSelf(
      actorId,
      targetUserId,
      'CANNOT_CHANGE_OWN_PERMISSIONS',
      'You cannot change your own permissions',
    );

    await this.db.transaction(async (tx) => {
      const user = await this.usersRepository.findById(targetUserId, tx);
      if (!user) throw new NotFoundException('User not found');
      const roles = await this.usersRepository.findRolesByUserId(targetUserId, tx);

      const effectivePermissions =
        await this.permissionCacheService.getPermissions(user.id, roles);

      if (effectivePermissions.has(validPermission)) {
        throw new BadRequestException({
          code: 'PERMISSION_ALREADY_HELD',
          message: 'The user already has this permission',
        });
      }

      const existing =
        await this.permissionOverridesRepository.findByUserAndPermission(
          user.id,
          validPermission,
          tx,
        );

      await this.permissionOverridesRepository.upsert(
        {
          userId: user.id,
          permission: validPermission,
          effect: 'grant',
          actorUserId: actorId,
          reason: reason ?? null,
        },
        tx,
      );

      await this.authAuditRepository.recordAuditLog(
        {
          actorUserId: actorId,
          action: 'admin_action',
          entityType: 'user_permission',
          entityId: user.id,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          before: existing
            ? { effect: existing.effect, reason: existing.reason }
            : null,
          after: {
            permission: validPermission,
            effect: 'grant',
            reason: reason ?? null,
          },
          metadata: {
            targetUserId: user.id,
            permission: validPermission,
            effect: 'grant',
          },
        },
        tx,
      );
    });

    this.permissionCacheService.invalidateUser(targetUserId);
    return this.getPermissionState(targetUserId);
  }

  async revokePermission(
    actorId: string,
    targetUserId: string,
    permission: string,
    reason?: string,
    metadata: AdminActionMetadata = {},
  ): Promise<UserPermissionState> {
    const validPermission = this.requirePermission(permission);

    this.assertNotSelf(
      actorId,
      targetUserId,
      'CANNOT_CHANGE_OWN_PERMISSIONS',
      'You cannot change your own permissions',
    );

    await this.db.transaction(async (tx) => {
      const user = await this.usersRepository.findById(targetUserId, tx);
      if (!user) throw new NotFoundException('User not found');
      const roles = await this.usersRepository.findRolesByUserId(targetUserId, tx);

      const effectivePermissions =
        await this.permissionCacheService.getPermissions(user.id, roles);

      if (!effectivePermissions.has(validPermission)) {
        throw new BadRequestException({
          code: 'PERMISSION_NOT_HELD',
          message: 'The user does not have this permission',
        });
      }

      const existing =
        await this.permissionOverridesRepository.findByUserAndPermission(
          user.id,
          validPermission,
          tx,
        );

      await this.permissionOverridesRepository.upsert(
        {
          userId: user.id,
          permission: validPermission,
          effect: 'revoke',
          actorUserId: actorId,
          reason: reason ?? null,
        },
        tx,
      );

      await this.authAuditRepository.recordAuditLog(
        {
          actorUserId: actorId,
          action: 'admin_action',
          entityType: 'user_permission',
          entityId: user.id,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          before: existing
            ? { effect: existing.effect, reason: existing.reason }
            : null,
          after: {
            permission: validPermission,
            effect: 'revoke',
            reason: reason ?? null,
          },
          metadata: {
            targetUserId: user.id,
            permission: validPermission,
            effect: 'revoke',
          },
        },
        tx,
      );
    });

    this.permissionCacheService.invalidateUser(targetUserId);
    return this.getPermissionState(targetUserId);
  }

  async clearPermissionOverride(
    actorId: string,
    targetUserId: string,
    permission: string,
    metadata: AdminActionMetadata = {},
  ): Promise<UserPermissionState> {
    const validPermission = this.requirePermission(permission);

    this.assertNotSelf(
      actorId,
      targetUserId,
      'CANNOT_CHANGE_OWN_PERMISSIONS',
      'You cannot change your own permissions',
    );

    await this.db.transaction(async (tx) => {
      const user = await this.usersRepository.findById(targetUserId, tx);
      if (!user) throw new NotFoundException('User not found');

      const existing =
        await this.permissionOverridesRepository.findByUserAndPermission(
          user.id,
          validPermission,
          tx,
        );

      if (!existing) {
        throw new NotFoundException('Permission override not found');
      }

      await this.permissionOverridesRepository.delete(
        user.id,
        validPermission,
        tx,
      );

      await this.authAuditRepository.recordAuditLog(
        {
          actorUserId: actorId,
          action: 'admin_action',
          entityType: 'user_permission',
          entityId: user.id,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          before: {
            permission: validPermission,
            effect: existing.effect,
            reason: existing.reason,
          },
          after: null,
          metadata: {
            targetUserId: user.id,
            permission: validPermission,
            operation: 'override_cleared',
          },
        },
        tx,
      );
    });

    this.permissionCacheService.invalidateUser(targetUserId);
    return this.getPermissionState(targetUserId);
  }

  private async changeRoles(
    actorId: string,
    targetUserId: string,
    mutate: (
      existingRoles: Role[],
      tx: UserTransaction,
    ) => Promise<{
      previousRoles: Role[];
      nextRoles: Role[];
      operation: 'assigned' | 'updated' | 'removed';
    }>,
    metadata: AdminActionMetadata,
  ): Promise<User & { roles: Role[] }> {
    this.assertNotSelf(
      actorId,
      targetUserId,
      'CANNOT_CHANGE_OWN_ROLE',
      'You cannot change your own role',
    );

    await this.db.transaction(async (tx) => {
      const existing = await this.usersRepository.findById(targetUserId, tx);
      if (!existing) throw new NotFoundException('User not found');

      const existingRoles = await this.usersRepository.findRolesByUserId(
        targetUserId,
        tx,
      );
      const { previousRoles, nextRoles, operation } = await mutate(
        existingRoles,
        tx,
      );

      await this.assertNotLastAdmin(previousRoles, nextRoles, tx);

      // Role changes reset overrides so grants/revokes from the previous
      // role set cannot leak into the new one.
      await this.permissionOverridesRepository.deleteAllForUser(
        targetUserId,
        tx,
      );

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'role_changed',
          severity: 'high',
          userId: targetUserId,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
          metadata: {
            actorId,
            operation,
            previousRoles,
            newRoles: nextRoles,
          },
        },
        tx,
      );
    });

    this.permissionCacheService.invalidateUser(targetUserId);
    return this.findById(targetUserId);
  }

  private async assertNotLastAdmin(
    previousRoles: Role[],
    nextRoles: Role[],
    tx: UserTransaction,
  ): Promise<void> {
    const hadAdmin = previousRoles.includes(ROLES.ADMIN);
    const willHaveAdmin = nextRoles.includes(ROLES.ADMIN);
    if (!hadAdmin || willHaveAdmin) {
      return;
    }

    const adminCount = await this.userRolesRepository.countUsersWithRole(
      ROLES.ADMIN,
      tx,
    );

    if (adminCount <= 1) {
      throw new BadRequestException({
        code: 'LAST_ADMIN',
        message: 'The last administrator cannot be demoted',
      });
    }
  }

  private assertNotSelf(
    actorId: string,
    targetUserId: string,
    code: string,
    message: string,
  ): void {
    if (actorId === targetUserId) {
      throw new BadRequestException({ code, message });
    }
  }

  private requirePermission(permission: string): Permission {
    if (!isPermission(permission)) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSION',
        message: 'Unknown permission',
      });
    }

    return permission;
  }
}
