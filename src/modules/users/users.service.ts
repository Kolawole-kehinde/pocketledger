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
  type Role,
} from '../authorization/roles.js';
import {
  isPermission,
  type Permission,
} from '../authorization/permissions.js';
import { PermissionOverridesRepository } from '../authorization/repositories/permission-overrides.repository.js';
import { PermissionCacheService } from '../authorization/services/permission-cache.service.js';
import { UsersRepository } from './users.repository.js';
import type {
  AdminActionMetadata,
  CreateVerifiedCustomerData,
  PaginatedUsers,
  UpdateUserData,
  UserListFilters,
  UserPermissionState,
  UserTransaction,
} from './users.types.js';

const MAX_USER_LIST_OFFSET = 100_000;

type RoleChangeOperation = 'assigned' | 'updated' | 'removed';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly usersRepository: UsersRepository,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly permissionOverridesRepository: PermissionOverridesRepository,
    private readonly authAuditRepository: AuthAuditRepository,
  ) {}

  async createVerifiedCustomer(
    data: CreateVerifiedCustomerData,
    tx: UserTransaction,
  ): Promise<User> {
    const normalizedEmail = data.email.trim().toLowerCase();

    const existingUser = await this.usersRepository.findByEmail(
      normalizedEmail,
      tx,
    );

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    return this.usersRepository.create(
      {
        ...data,
        email: normalizedEmail,
        role: DEFAULT_ROLE,
        status: 'active',
      },
      tx,
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();

    return this.usersRepository.findByEmail(normalizedEmail);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
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

      return updatedUser;
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

  /**
   * Assigns or replaces a user's role. Role changes reset per-user permission
   * overrides so the account returns to the new role's baseline.
   */
  async updateRole(
    actorId: string,
    targetUserId: string,
    role: Role,
    metadata: AdminActionMetadata = {},
  ): Promise<User> {
    return this.changeRole(
      actorId,
      targetUserId,
      role,
      'updated',
      metadata,
    );
  }

  /**
   * Assigns a role to a user. Semantically equivalent to `updateRole`; kept as
   * a distinct entry point so the API can expose both `POST /roles` and
   * `PATCH /role` without duplicating authorization rules.
   */
  async assignRole(
    actorId: string,
    targetUserId: string,
    role: Role,
    metadata: AdminActionMetadata = {},
  ): Promise<User> {
    return this.changeRole(
      actorId,
      targetUserId,
      role,
      'assigned',
      metadata,
    );
  }

  /**
   * Removes an elevated role by returning the user to the default customer
   * role. Every account must have a role, so removal is a downgrade rather
   * than a null role.
   */
  async removeRole(
    actorId: string,
    targetUserId: string,
    metadata: AdminActionMetadata = {},
  ): Promise<User> {
    const existing = await this.findById(targetUserId);

    if (existing.role === DEFAULT_ROLE) {
      throw new BadRequestException({
        code: 'ROLE_ALREADY_REMOVED',
        message: `The user already has the default ${DEFAULT_ROLE} role`,
      });
    }

    return this.changeRole(
      actorId,
      targetUserId,
      DEFAULT_ROLE,
      'removed',
      metadata,
    );
  }

  async updateStatus(
    actorId: string,
    targetUserId: string,
    status: User['status'],
    metadata: AdminActionMetadata = {},
  ): Promise<User> {
    this.assertNotSelf(
      actorId,
      targetUserId,
      'CANNOT_CHANGE_OWN_STATUS',
      'You cannot change your own account status',
    );

    const updatedUser = await this.db.transaction(async (tx) => {
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

    return updatedUser;
  }

  async listUsers(filters: UserListFilters): Promise<PaginatedUsers> {
    const { page, pageSize } = filters;

    const offset = (page - 1) * pageSize;

    if (
      !Number.isSafeInteger(offset) ||
      offset > MAX_USER_LIST_OFFSET
    ) {
      throw new BadRequestException(
        'Requested page exceeds the maximum supported offset.',
      );
    }

    const { data, total } =
      await this.usersRepository.findMany({
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

  /**
   * Returns the user's role, the effective permission set after overrides and
   * the raw overrides themselves. Used by the admin permission screens.
   */
  async getPermissionState(userId: string): Promise<UserPermissionState> {
    const user = await this.findById(userId);

    const [effectivePermissions, overrides] = await Promise.all([
      this.permissionCacheService.getPermissions(user.id, user.role),
      this.permissionOverridesRepository.findByUserId(user.id),
    ]);

    return {
      user,
      permissions: [...effectivePermissions].sort(),
      overrides,
    };
  }

  /**
   * Grants a permission the user's role does not provide by default.
   */
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

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const effectivePermissions =
        await this.permissionCacheService.getPermissions(
          user.id,
          user.role,
        );

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
            ? {
                effect: existing.effect,
                reason: existing.reason,
              }
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

  /**
   * Revokes a permission the user currently holds, either from their role or
   * from a previous grant.
   */
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

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const effectivePermissions =
        await this.permissionCacheService.getPermissions(
          user.id,
          user.role,
        );

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
            ? {
                effect: existing.effect,
                reason: existing.reason,
              }
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

  /**
   * Removes an explicit grant/revoke override, returning the user to the
   * permission set defined by their role.
   */
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

      if (!user) {
        throw new NotFoundException('User not found');
      }

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

  private async changeRole(
    actorId: string,
    targetUserId: string,
    role: Role,
    operation: RoleChangeOperation,
    metadata: AdminActionMetadata,
  ): Promise<User> {
    this.assertNotSelf(
      actorId,
      targetUserId,
      'CANNOT_CHANGE_OWN_ROLE',
      'You cannot change your own role',
    );

    const updatedUser = await this.db.transaction(async (tx) => {
      const existing = await this.usersRepository.findById(targetUserId, tx);

      if (!existing) {
        throw new NotFoundException('User not found');
      }

      if (existing.role === role) {
        if (operation === 'removed') {
          throw new BadRequestException({
            code: 'ROLE_ALREADY_REMOVED',
            message: `The user already has the default ${DEFAULT_ROLE} role`,
          });
        }

        return existing;
      }

      await this.assertNotLastAdmin(existing, role, tx);

      const updated = await this.usersRepository.updateRole(
        targetUserId,
        role,
        tx,
      );

      if (!updated) {
        throw new NotFoundException('User not found');
      }

      // A role change resets overrides so grants/revokes from the previous
      // role cannot leak into the new one.
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
            previousRole: existing.role,
            newRole: updated.role,
          },
        },
        tx,
      );

      return updated;
    });

    this.permissionCacheService.invalidateUser(targetUserId);

    return updatedUser;
  }

  private async assertNotLastAdmin(
    user: User,
    nextRole: Role,
    tx: UserTransaction,
  ): Promise<void> {
    if (user.role !== ROLES.ADMIN || nextRole === ROLES.ADMIN) {
      return;
    }

    const adminCount = await this.usersRepository.countByRole(
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
