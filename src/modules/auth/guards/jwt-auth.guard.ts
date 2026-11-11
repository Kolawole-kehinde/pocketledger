import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../authorization/authorization.types.js';
import { IS_PUBLIC_KEY } from '../../authorization/decorators/public.decorator.js';
import type { AccessTokenPayload } from '../auth.types.js';
import { AuthAuditRepository } from '../repositories/auth-audit.repository.js';
import { SessionsRepository } from '../repositories/sessions.repository.js';
import { AccessTokenRevocationService } from '../services/access-token-revocation.service.js';
import { TokenService } from '../services/token.service.js';
import { authUnauthorized } from '../utils/auth-errors.js';
import {
  extractBearerToken,
  getRequestMetadata,
  type RequestMetadata,
} from '../utils/request-metadata.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly accessTokenRevocationService: AccessTokenRevocationService,
    private readonly sessionsRepository: SessionsRepository,
    private readonly authAuditRepository: AuthAuditRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw authUnauthorized(
        'UNAUTHENTICATED',
        'Authentication is required',
      );
    }

    const payload = await this.tokenService.verifyAccessToken(token);
    const metadata = getRequestMetadata(request);

    if (await this.accessTokenRevocationService.isRevoked(payload.jti)) {
      await this.recordSuspiciousActivity(payload, metadata, {
        reason: 'revoked_access_token',
        severity: 'high',
      });

      throw authUnauthorized(
        'TOKEN_REVOKED',
        'This access token has been revoked',
      );
    }

    const active = await this.sessionsRepository.findActiveWithUser(
      payload.sid,
    );

    if (!active || active.user.id !== payload.sub) {
      await this.recordSuspiciousActivity(payload, metadata, {
        reason: 'invalid_session',
        severity: 'high',
      });

      throw authUnauthorized(
        'SESSION_INVALID',
        'Your session is no longer valid',
      );
    }

    const authenticatedRequest =
      request as unknown as AuthenticatedRequest;

    authenticatedRequest.user = {
      sub: active.user.id,
      email: active.user.email,
      role: active.user.role,
      sessionId: active.session.id,
      jti: payload.jti,
    };

    return true;
  }

  /**
   * A request that presents a validly signed token for a revoked token or a
   * session that no longer exists is a strong signal that credentials have
   * leaked. Recording failures must never change the authentication outcome,
   * so audit errors are logged and swallowed.
   */
  private async recordSuspiciousActivity(
    payload: AccessTokenPayload,
    metadata: RequestMetadata,
    input: {
      reason: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    },
  ): Promise<void> {
    try {
      await this.authAuditRepository.recordSecurityEvent({
        type: 'suspicious_activity_detected',
        severity: input.severity,
        userId: payload.sub,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          reason: input.reason,
          sessionId: payload.sid,
          jti: payload.jti,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record ${input.reason} security event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
