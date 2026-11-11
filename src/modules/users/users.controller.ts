import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../authorization/decorators/current-user.decorator.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PERMISSIONS, getRoleCatalog } from '../authorization/permissions.js';
import { getRequestMetadata } from '../auth/utils/request-metadata.js';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto.js';
import { RoleCatalogEntryResponseDto } from './dto/role-catalog-response.dto.js';
import { UserPermissionStateResponseDto } from './dto/user-permission-state-response.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import {
  permissionOverrideSchema,
  permissionParamSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
  type PermissionOverrideInput,
  type UpdateUserRoleInput,
  type UpdateUserStatusInput,
} from './schemas/admin-user-schemas.js';
import {
  userListQuerySchema,
  type UserListQuery,
} from './schemas/user-query-schema.js';
import { updateUserSchema } from './schemas/update-user-schema.js';
import type { UpdateUserInput } from './schemas/update-user-schema.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @RequirePermissions(PERMISSIONS.PROFILE_READ)
  async getCurrentUser(
    @CurrentUser('sub') userId: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);

    return new UserResponseDto(user);
  }

  @Patch('me')
  @RequirePermissions(PERMISSIONS.PROFILE_UPDATE)
  async updateCurrentUser(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(updateUserSchema))
    data: UpdateUserInput,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(userId, data);

    return new UserResponseDto(user);
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  getRoles(): RoleCatalogEntryResponseDto[] {
    return getRoleCatalog().map(
      (entry) => new RoleCatalogEntryResponseDto(entry),
    );
  }

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async listUsers(
    @Query(new ZodValidationPipe(userListQuerySchema))
    query: UserListQuery,
  ): Promise<PaginatedUsersResponseDto> {
    const result = await this.usersService.listUsers(query);

    return new PaginatedUsersResponseDto(result);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async getUser(
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);

    return new UserResponseDto(user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  async updateUser(
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(updateUserSchema))
    data: UpdateUserInput,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(userId, data);

    return new UserResponseDto(user);
  }

  /**
   * Assign a role. Provided alongside `PATCH /users/:id/role` so clients can
   * model role assignment and role replacement as separate operations.
   */
  @Post(':id/roles')
  @RequirePermissions(PERMISSIONS.USERS_ROLE_UPDATE)
  async assignRole(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(updateUserRoleSchema))
    body: UpdateUserRoleInput,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.assignRole(
      actorId,
      userId,
      body.role,
      getRequestMetadata(request),
    );

    return new UserResponseDto(user);
  }

  @Patch(':id/role')
  @RequirePermissions(PERMISSIONS.USERS_ROLE_UPDATE)
  async updateRole(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(updateUserRoleSchema))
    body: UpdateUserRoleInput,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateRole(
      actorId,
      userId,
      body.role,
      getRequestMetadata(request),
    );

    return new UserResponseDto(user);
  }

  /**
   * Remove an elevated role. The user is downgraded to the default customer
   * role; the last administrator cannot be removed.
   */
  @Delete(':id/role')
  @RequirePermissions(PERMISSIONS.USERS_ROLE_UPDATE)
  async removeRole(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.removeRole(
      actorId,
      userId,
      getRequestMetadata(request),
    );

    return new UserResponseDto(user);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.USERS_STATUS_UPDATE)
  async updateStatus(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(updateUserStatusSchema))
    body: UpdateUserStatusInput,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateStatus(
      actorId,
      userId,
      body.status,
      getRequestMetadata(request),
    );

    return new UserResponseDto(user);
  }

  @Get(':id/permissions')
  @RequirePermissions(PERMISSIONS.USERS_PERMISSIONS_READ)
  async getPermissions(
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
  ): Promise<UserPermissionStateResponseDto> {
    const state = await this.usersService.getPermissionState(userId);

    return new UserPermissionStateResponseDto(state);
  }

  @Post(':id/permissions/grant')
  @RequirePermissions(PERMISSIONS.USERS_PERMISSIONS_MANAGE)
  async grantPermission(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(permissionOverrideSchema))
    body: PermissionOverrideInput,
    @Req() request: Request,
  ): Promise<UserPermissionStateResponseDto> {
    const state = await this.usersService.grantPermission(
      actorId,
      userId,
      body.permission,
      body.reason,
      getRequestMetadata(request),
    );

    return new UserPermissionStateResponseDto(state);
  }

  @Post(':id/permissions/revoke')
  @RequirePermissions(PERMISSIONS.USERS_PERMISSIONS_MANAGE)
  async revokePermission(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(permissionOverrideSchema))
    body: PermissionOverrideInput,
    @Req() request: Request,
  ): Promise<UserPermissionStateResponseDto> {
    const state = await this.usersService.revokePermission(
      actorId,
      userId,
      body.permission,
      body.reason,
      getRequestMetadata(request),
    );

    return new UserPermissionStateResponseDto(state);
  }

  /**
   * Clear an explicit grant/revoke override so the user returns to the
   * permission baseline for their role.
   */
  @Delete(':id/permissions/:permission')
  @RequirePermissions(PERMISSIONS.USERS_PERMISSIONS_MANAGE)
  async clearPermissionOverride(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Param('permission', new ZodValidationPipe(permissionParamSchema))
    permission: string,
    @Req() request: Request,
  ): Promise<UserPermissionStateResponseDto> {
    const state = await this.usersService.clearPermissionOverride(
      actorId,
      userId,
      permission,
      getRequestMetadata(request),
    );

    return new UserPermissionStateResponseDto(state);
  }
}
