import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../authorization/decorators/current-user.decorator.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import {
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdParamSchema,
  type UpdateUserRoleInput,
  type UpdateUserStatusInput,
} from './schemas/admin-user-schemas.js';
import {
  updateUserSchema,
  type UpdateUserInput,
} from './schemas/update-user-schema.js';
import {
  userListQuerySchema,
  type UserListQuery,
} from './schemas/user-query-schema.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  @RequirePermissions(PERMISSIONS.PROFILE_READ)
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  async getMyProfile(@CurrentUser('sub') userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);

    return new UserResponseDto(user);
  }
  

  @Patch('me')
  @RequirePermissions(PERMISSIONS.PROFILE_UPDATE)
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        firstName: { type: 'string', minLength: 1, maxLength: 100 },
        lastName: { type: 'string', minLength: 1, maxLength: 100 },
        middleName: {
          type: 'string',
          maxLength: 100,
          nullable: true,
        },
        username: {
          type: 'string',
          minLength: 3,
          maxLength: 30,
          pattern: '^[a-zA-Z0-9_.-]+$',
        },
        phoneNumber: {
          type: 'string',
          pattern: '^\\+?[0-9]{7,20}$',
        },
      },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  async updateMyProfile(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(updateUserSchema))
    data: UpdateUserInput,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(userId, data);

    return new UserResponseDto(user);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({
    summary: 'List users',
    description:
      'Returns users ordered by creation date, newest first. Requires the ' +
      '`users:read` permission.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
    },
  })
  @ApiQuery({
    name: 'search',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 255 },
    description:
      'Case-insensitive match on email, first name, last name or username.',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['customer', 'support', 'admin'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'pending_verification',
      'active',
      'suspended',
      'closed',
    ],
  })
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  async listUsers(
    @Query(new ZodValidationPipe(userListQuerySchema))
    query: UserListQuery,
  ): Promise<PaginatedUsersResponseDto> {
    const result = await this.usersService.listUsers(query);

    return new PaginatedUsersResponseDto(result);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async getUser(
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);

    return new UserResponseDto(user);
  }

  @Patch(':id/role')
  @RequirePermissions(PERMISSIONS.USERS_ROLE_UPDATE)
  @ApiOperation({
    summary: 'Change a user role',
    description:
      'Requires the `users:role:update` permission. Admins cannot change ' +
      'their own role.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['role'],
      properties: {
        role: {
          type: 'string',
          enum: ['customer', 'support', 'admin'],
        },
      },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async updateUserRole(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(updateUserRoleSchema))
    body: UpdateUserRoleInput,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateRole(
      actorId,
      userId,
      body.role,
    );

    return new UserResponseDto(user);
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.USERS_STATUS_UPDATE)
  @ApiOperation({
    summary: 'Change a user status',
    description:
      'Requires the `users:status:update` permission. Admins cannot suspend ' +
      'or close their own account.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: [
            'pending_verification',
            'active',
            'suspended',
            'closed',
          ],
        },
      },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async updateUserStatus(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(updateUserStatusSchema))
    body: UpdateUserStatusInput,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateStatus(
      actorId,
      userId,
      body.status,
    );

    return new UserResponseDto(user);
  }
}
