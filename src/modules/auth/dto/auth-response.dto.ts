import type { Session } from '../../../infrastructure/database/schema/sessions.schema.js';
import { MessageResponseDto } from './message-response.dto.js';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export { MessageResponseDto } from './message-response.dto.js';

export class AuthTokenResponseDto {
  accessToken: string;

  tokenType = 'Bearer';

  expiresIn: number;

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
  id: string;

  deviceName: string | null;

  userAgent: string | null;

  ipAddress: string | null;

  createdAt: Date;

  lastActivityAt: Date | null;

  expiresAt: Date;

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
  expiresInMinutes?: number;

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
