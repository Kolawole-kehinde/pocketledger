import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { updateUserSchema } from './schemas/update-user-schema.js';
import type { UpdateUserInput } from './schemas/update-user-schema.js';
import { userIdParamSchema } from './schemas/admin-user-schemas.js';
import {
  userListQuerySchema,
  type UserListQuery,
} from './schemas/user-query-schema.js';
import { UsersService } from './users.service.js';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto.js';



@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listUsers(
    @Query(new ZodValidationPipe(userListQuerySchema))
    query: UserListQuery,
  ): Promise<PaginatedUsersResponseDto> {
    const result = await this.usersService.listUsers(query);

    return new PaginatedUsersResponseDto(result);
  }

  @Get(':id')
  async getUser(
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);

    return new UserResponseDto(user);
  }

  @Patch(':id')
  async updateUser(
    @Param('id', new ZodValidationPipe(userIdParamSchema))
    userId: string,
    @Body(new ZodValidationPipe(updateUserSchema))
    data: UpdateUserInput,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(userId, data);

    return new UserResponseDto(user);
  }
}
