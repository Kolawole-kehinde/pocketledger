import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AccessTokenPayload,
  RegistrationTokenPayload,
} from '../auth.types.js';
import {
  TOKEN_TYPE_ACCESS,
  TOKEN_TYPE_REGISTRATION,
} from '../auth.constants.js';
import {
  hashRefreshToken,
} from '../utils/token-hash.js';

const ACCESS_TOKEN_JTI_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  getAccessTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>(
      'JWT_ACCESS_TTL_SECONDS',
    );
  }

  getRegistrationTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>(
      'JWT_REGISTRATION_TTL_SECONDS',
    );
  }

  getRefreshTokenTtlSeconds(): number {
    return this.configService.getOrThrow<number>(
      'REFRESH_TOKEN_TTL_SECONDS',
    );
  }

  getSessionTtlSeconds(): number {
    return this.configService.getOrThrow<number>(
      'SESSION_TTL_SECONDS',
    );
  }

  async signAccessToken(input: {
    userId: string;
    sessionId: string;
    email: string;
    role: AccessTokenPayload['role'];
  }): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: input.userId,
        sid: input.sessionId,
        email: input.email,
        role: input.role,
        type: TOKEN_TYPE_ACCESS,
      },
      {
        secret: this.configService.getOrThrow<string>(
          'JWT_ACCESS_SECRET',
        ),
        expiresIn: this.getAccessTokenTtlSeconds(),
        issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
        audience: this.configService.getOrThrow<string>(
          'JWT_AUDIENCE',
        ),
        algorithm: 'HS256',
        jwtid: randomUUID(),
      },
    );
  }

  async verifyAccessToken(
    token: string,
  ): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>(
            'JWT_ACCESS_SECRET',
          ),
          issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
          audience: this.configService.getOrThrow<string>(
            'JWT_AUDIENCE',
          ),
          algorithms: ['HS256'],
        },
      );

      if (
        payload.type !== TOKEN_TYPE_ACCESS ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.jti !== 'string' ||
        !ACCESS_TOKEN_JTI_PATTERN.test(payload.jti)
      ) {
        throw new Error('Invalid access token payload');
      }

      return payload;
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
        message: 'Authentication is required',
      });
    }
  }

  async signRegistrationToken(input: {
    pendingRegistrationId: string;
    email: string;
  }): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: input.pendingRegistrationId,
        email: input.email,
        type: TOKEN_TYPE_REGISTRATION,
      },
      {
        secret: this.configService.getOrThrow<string>(
          'JWT_REGISTRATION_SECRET',
        ),
        expiresIn: this.getRegistrationTokenTtlSeconds(),
        issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
        audience: this.configService.getOrThrow<string>(
          'JWT_REGISTRATION_AUDIENCE',
        ),
        algorithm: 'HS256',
      },
    );
  }

  async verifyRegistrationToken(
    token: string,
  ): Promise<RegistrationTokenPayload> {
    try {
      const payload =
        await this.jwtService.verifyAsync<RegistrationTokenPayload>(
          token,
          {
            secret: this.configService.getOrThrow<string>(
              'JWT_REGISTRATION_SECRET',
            ),
            issuer: this.configService.getOrThrow<string>(
              'JWT_ISSUER',
            ),
            audience: this.configService.getOrThrow<string>(
              'JWT_REGISTRATION_AUDIENCE',
            ),
            algorithms: ['HS256'],
          },
        );

      if (
        payload.type !== TOKEN_TYPE_REGISTRATION ||
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string'
      ) {
        throw new Error('Invalid registration token payload');
      }

      return payload;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'TokenExpiredError'
      ) {
        throw new UnauthorizedException({
          statusCode: 401,
          code: 'REGISTRATION_TOKEN_EXPIRED',
          message:
            'The registration token has expired. Verify the OTP again to ' +
            'receive a new token.',
        });
      }

      throw new UnauthorizedException({
        statusCode: 401,
        code: 'INVALID_REGISTRATION_TOKEN',
        message: 'Invalid or expired registration token',
      });
    }
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return hashRefreshToken(
      token,
      this.configService.getOrThrow<string>(
        'REFRESH_TOKEN_HASH_SECRET',
      ),
    );
  }
}
