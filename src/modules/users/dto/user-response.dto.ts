import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { User } from '../../../infrastructure/database/schema/users.schema.js';
import {
  userRoleEnum,
  userStatusEnum,
} from '../../../infrastructure/database/schema/users.schema.js';

export class UserResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '1f8b0f0a-2b9d-4c4e-9b6c-0d7e2f3a4b5c',
  })
  id: string;

  @ApiProperty({ example: 'Ada' })
  firstName: string;

  @ApiProperty({ example: 'Lovelace' })
  lastName: string;

  @ApiPropertyOptional({ nullable: true, example: 'Augusta' })
  middleName: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'ada.lovelace' })
  username: string | null;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiPropertyOptional({ nullable: true, example: '+2348012345678' })
  phoneNumber: string | null;

  @ApiProperty({ enum: userRoleEnum.enumValues, example: 'customer' })
  role: User['role'];

  @ApiProperty({ enum: userStatusEnum.enumValues, example: 'active' })
  status: User['status'];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  constructor(user: User) {
    this.id = user.id;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.middleName = user.middleName;
    this.username = user.username;
    this.email = user.email;
    this.phoneNumber = user.phoneNumber;
    this.role = user.role;
    this.status = user.status;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}
