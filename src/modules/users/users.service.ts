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
import { PermissionCacheService } from '../authorization/services/permission-cache.service.js';
import { UsersRepository } from './users.repository.js';
import type {
  CreateVerifiedCustomerData,
  PaginatedUsers,
  UpdateUserData,
  UserListFilters,
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
        role: 'customer',
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

    const updatedUser = await this.usersRepository.update(id, data);

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }
  async updateRole(
    actorId: string,
    targetUserId: string,
    role: User['role'],
  ): Promise<User> {
    if (actorId === targetUserId) {
      throw new BadRequestException({
        code: 'CANNOT_CHANGE_OWN_ROLE',
        message: 'You cannot change your own role',
      });
    }

    const updatedUser = await this.db.transaction(async (tx) => {
      const existing = await this.usersRepository.findById(targetUserId, tx);

      if (!existing) {
        throw new NotFoundException('User not found');
      }

      if (existing.role === role) {
        return existing;
      }

      const updated = await this.usersRepository.updateRole(
        targetUserId,
        role,
        tx,
      );

      if (!updated) {
        throw new NotFoundException('User not found');
      }

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'role_changed',
          severity: 'high',
          userId: targetUserId,
          metadata: {
            actorId,
            previousRole: existing.role,
            newRole: updated.role,
          },
        },
        tx,
      );

      return updated;
    });

    await this.permissionCacheService.invalidateUser(targetUserId);

    return updatedUser;
  }

  async updateStatus(
    actorId: string,
    targetUserId: string,
    status: User['status'],
  ): Promise<User> {
    if (actorId === targetUserId) {
      throw new BadRequestException({
        code: 'CANNOT_CHANGE_OWN_STATUS',
        message: 'You cannot change your own account status',
      });
    }

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

    await this.permissionCacheService.invalidateUser(targetUserId);

    return updatedUser;
  }


  async listUsers(
  filters: UserListFilters,
): Promise<PaginatedUsers> {
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
  
}
