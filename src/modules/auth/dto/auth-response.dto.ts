import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Session } from '../../../infrastructure/database/schema/sessions.schema.js';
import { MessageResponseDto } from './message-response.dto.js';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export { MessageResponseDto } from './message-response.dto.js';

export class AuthTokenResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token.' })
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType = 'Bearer';

  @ApiProperty({
    description: 'Access token lifetime in seconds.',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({ type: () => UserResponseDto })
  user: UserResponseDto;

  constructor(input: {
    accessToken: string;
    expiresIn: number;
    user: ConstructorParameters<typeof UserResponseDto>[0];
  }) {
    this.accessToken = input.accessToken;
    this.expiresIn = input.expiresIn;
    this.user = new UserResponseDto(input.user);
  }
}

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ nullable: true, example: 'Chrome on Windows' })
  deviceName: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  })
  userAgent: string | null;

  @ApiPropertyOptional({ nullable: true, example: '203.0.113.10' })
  ipAddress: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  lastActivityAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;

  @ApiProperty({
    description: 'Whether this is the session making the request.',
  })
  current: boolean;

  constructor(session: Session, currentSessionId: string) {
    this.id = session.id;
    this.deviceName = session.deviceName;
    this.userAgent = session.userAgent;
    this.ipAddress = session.ipAddress;
    this.createdAt = session.createdAt;
    this.lastActivityAt = session.lastActivityAt;
    this.expiresAt = session.expiresAt;
    this.current = session.id === currentSessionId;
  }
}

export class OtpRequestedResponseDto extends MessageResponseDto {
  @ApiPropertyOptional({ example: 5 })
  expiresInMinutes?: number;

  @ApiPropertyOptional({ example: 60 })
  resendAfterSeconds?: number;

  constructor(input: {
    message: string;
    expiresInMinutes?: number;
    resendAfterSeconds?: number;
  }) {
    super(input.message);
    this.expiresInMinutes = input.expiresInMinutes;
    this.resendAfterSeconds = input.resendAfterSeconds;
  }
}
