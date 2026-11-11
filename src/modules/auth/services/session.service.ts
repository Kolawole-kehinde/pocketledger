import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE,
} from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import type {
  Session,
} from '../../../infrastructure/database/schema/sessions.schema.js';
import type { AccessTokenRevocation } from '../../../infrastructure/database/schema/access-token-revocations.schema.js';
import type { User } from '../../../infrastructure/database/schema/users.schema.js';
import type {
  AuthTransaction,
  RefreshRotationResult,
  SessionCreationResult,
  SessionWithTokens,
} from '../auth.types.js';
import { AUTH_MESSAGES } from '../auth.constants.js';
import {
  authForbidden,
  authNotFound,
  authUnauthorized,
} from '../utils/auth-errors.js';
import type { RequestMetadata } from '../utils/request-metadata.js';
import { AuthAuditRepository } from '../repositories/auth-audit.repository.js';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { SessionsRepository } from '../repositories/sessions.repository.js';
import { AccessTokenRevocationService } from './access-token-revocation.service.js';
import { TokenService } from './token.service.js';

@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessionsRepository: SessionsRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly tokenService: TokenService,
    private readonly authAuditRepository: AuthAuditRepository,
    private readonly accessTokenRevocationService: AccessTokenRevocationService,
  ) {}

  async createSession(
    tx: AuthTransaction,
    user: User,
    metadata: RequestMetadata,
  ): Promise<SessionCreationResult> {
    const now = new Date();
    const sessionExpiresAt = new Date(
      now.getTime() + this.tokenService.getSessionTtlSeconds() * 1_000,
    );

    const session = await this.sessionsRepository.create(
      {
        userId: user.id,
        deviceName: metadata.deviceName,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        lastActivityAt: now,
        expiresAt: sessionExpiresAt,
      },
      tx,
    );

    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.tokenService.getRefreshTokenTtlSeconds() * 1_000,
    );

    const refreshTokenRecord = await this.refreshTokensRepository.create(
      {
        sessionId: session.id,
        tokenHash: this.tokenService.hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiresAt,
      },
      tx,
    );

    await this.authAuditRepository.recordSecurityEvent(
      {
        type: 'session_created',
        severity: 'low',
        userId: user.id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          sessionId: session.id,
          deviceName: metadata.deviceName,
        },
      },
      tx,
    );

    return {
      session,
      refreshToken,
      refreshTokenRecord,
    };
  }

  async issueSession(
    user: User,
    metadata: RequestMetadata,
  ): Promise<SessionWithTokens> {
    const created = await this.db.transaction(async (tx) => {
      return this.createSession(tx, user, metadata);
    });

    return this.withAccessToken(created, user);
  }

  async signSessionAccessToken(
    created: SessionCreationResult,
    user: User,
  ): Promise<SessionWithTokens> {
    return this.withAccessToken(created, user);
  }

  private async withAccessToken(
    created: SessionCreationResult,
    user: User,
  ): Promise<SessionWithTokens> {
    const accessToken = await this.tokenService.signAccessToken({
      userId: user.id,
      sessionId: created.session.id,
      email: user.email,
      role: user.role,
    });

    return {
      session: created.session,
      refreshToken: created.refreshToken,
      accessToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
    };
  }

  async rotateRefreshToken(
    refreshToken: string,
    metadata: RequestMetadata,
  ): Promise<{
    user: User;
    sessionId: string;
    refreshToken: string;
    refreshTokenExpiresAt: Date;
    accessToken: string;
    expiresIn: number;
  }> {
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const now = new Date();

    const result: RefreshRotationResult = await this.db.transaction(
      async (tx) => {
        const existing =
          await this.refreshTokensRepository.findByHash(
            tokenHash,
            tx,
            true,
          );

        if (!existing) {
          return { status: 'invalid' } as const;
        }

        if (existing.revokedAt) {
          await this.handleRefreshTokenReuse(
            tx,
            existing.sessionId,
            metadata,
          );

          return { status: 'reuse' } as const;
        }

        if (existing.expiresAt.getTime() <= now.getTime()) {
          const session = await this.sessionsRepository.findById(
            existing.sessionId,
            tx,
            true,
          );

          await this.refreshTokensRepository.revokeAllForSession(
            existing.sessionId,
            tx,
          );
          await this.sessionsRepository.revoke(
            existing.sessionId,
            'session_expired',
            tx,
          );

          await this.authAuditRepository.recordSecurityEvent(
            {
              type: 'session_revoked',
              severity: 'low',
              userId: session?.userId ?? null,
              ipAddress: metadata.ipAddress,
              userAgent: metadata.userAgent,
              metadata: {
                sessionId: existing.sessionId,
                reason: 'session_expired',
              },
            },
            tx,
          );

          return { status: 'expired' } as const;
        }

        const active = await this.sessionsRepository.findActiveWithUser(
          existing.sessionId,
          tx,
        );

        if (!active) {
          const session = await this.sessionsRepository.findById(
            existing.sessionId,
            tx,
            true,
          );

          await this.refreshTokensRepository.revokeAllForSession(
            existing.sessionId,
            tx,
          );

          await this.authAuditRepository.recordSecurityEvent(
            {
              type: 'suspicious_activity_detected',
              severity: 'high',
              userId: session?.userId ?? null,
              ipAddress: metadata.ipAddress,
              userAgent: metadata.userAgent,
              metadata: {
                reason: 'refresh_token_for_inactive_session',
                sessionId: existing.sessionId,
              },
            },
            tx,
          );

          return { status: 'invalid' } as const;
        }

        const nextRefreshToken = this.tokenService.generateRefreshToken();
        const refreshTokenExpiresAt = new Date(
          now.getTime() +
            this.tokenService.getRefreshTokenTtlSeconds() * 1_000,
        );

        const nextRecord = await this.refreshTokensRepository.create(
          {
            sessionId: existing.sessionId,
            tokenHash:
              this.tokenService.hashRefreshToken(nextRefreshToken),
            expiresAt: refreshTokenExpiresAt,
          },
          tx,
        );

        const revoked = await this.refreshTokensRepository.revokeAndReplace(
          existing.id,
          nextRecord.id,
          tx,
        );

        if (!revoked) {
          await this.handleRefreshTokenReuse(
            tx,
            existing.sessionId,
            metadata,
          );

          return { status: 'reuse' } as const;
        }

        await this.sessionsRepository.touch(
          existing.sessionId,
          now,
          new Date(
            now.getTime() +
              this.tokenService.getSessionTtlSeconds() * 1_000,
          ),
          tx,
        );

        await this.authAuditRepository.recordSecurityEvent(
          {
            type: 'refresh_token_rotated',
            severity: 'low',
            userId: active.user.id,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              sessionId: existing.sessionId,
            },
          },
          tx,
        );

        return {
          status: 'rotated' as const,
          user: active.user,
          sessionId: existing.sessionId,
          refreshToken: nextRefreshToken,
          refreshTokenExpiresAt,
        };
      },
    );

    switch (result.status) {
      case 'invalid':
        throw authUnauthorized(
          'INVALID_REFRESH_TOKEN',
          AUTH_MESSAGES.invalidRefreshToken,
        );

      case 'expired':
        throw authUnauthorized(
          'REFRESH_TOKEN_EXPIRED',
          AUTH_MESSAGES.invalidRefreshToken,
        );

      case 'reuse':
        throw authUnauthorized(
          'REFRESH_TOKEN_REUSE',
          AUTH_MESSAGES.refreshTokenReuse,
        );

      case 'rotated':
        break;
    }

    const accessToken = await this.tokenService.signAccessToken({
      userId: result.user.id,
      sessionId: result.sessionId,
      email: result.user.email,
      role: result.user.role,
    });

    return {
      user: result.user,
      sessionId: result.sessionId,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      accessToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
    };
  }

  private async handleRefreshTokenReuse(
    tx: DatabaseTransaction,
    sessionId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const session = await this.sessionsRepository.findById(
      sessionId,
      tx,
      true,
    );

    await this.sessionsRepository.revoke(
      sessionId,
      'refresh_token_reuse',
      tx,
    );
    await this.refreshTokensRepository.revokeAllForSession(
      sessionId,
      tx,
    );

    await this.authAuditRepository.recordSecurityEvent(
      {
        type: 'refresh_token_reuse_detected',
        severity: 'critical',
        userId: session?.userId ?? null,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          sessionId,
        },
      },
      tx,
    );
  }

  async listSessions(userId: string): Promise<Session[]> {
    return this.sessionsRepository.findActiveByUser(userId);
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    metadata: RequestMetadata,
    currentAccessToken?: { sessionId: string; jti: string },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const session = await this.sessionsRepository.findById(
        sessionId,
        tx,
        true,
      );

      if (!session) {
        throw authNotFound(
          'SESSION_NOT_FOUND',
          AUTH_MESSAGES.sessionNotFound,
        );
      }

      if (session.userId !== userId) {
        throw authForbidden(
          'SESSION_FORBIDDEN',
          AUTH_MESSAGES.sessionForbidden,
        );
      }

      const accessToken =
        currentAccessToken?.sessionId === session.id
          ? {
              jti: currentAccessToken.jti,
              reason: 'session_revoked' as const,
            }
          : undefined;

      await this.revokeOwnedSession(
        tx,
        session,
        'user_logout',
        metadata,
        accessToken,
      );
    });
  }

  async logout(
    userId: string,
    sessionId: string,
    metadata: RequestMetadata,
    accessTokenJti?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const session = await this.sessionsRepository.findById(
        sessionId,
        tx,
        true,
      );

      if (!session) {
        return;
      }

      if (session.userId !== userId) {
        await this.authAuditRepository.recordSecurityEvent(
          {
            type: 'suspicious_activity_detected',
            severity: 'high',
            userId,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              reason: 'session_ownership_mismatch',
              sessionId,
            },
          },
          tx,
        );

        return;
      }

      await this.revokeOwnedSession(
        tx,
        session,
        'user_logout',
        metadata,
        accessTokenJti
          ? { jti: accessTokenJti, reason: 'user_logout' }
          : undefined,
      );
    });
  }

  async logoutAll(
    userId: string,
    metadata: RequestMetadata,
    currentAccessToken?: { sessionId: string; jti: string },
  ): Promise<number> {
    return this.db.transaction(async (tx) => {
      const revoked =
        await this.sessionsRepository.revokeAllForUser(
          userId,
          'logout_all',
          tx,
        );

      await this.refreshTokensRepository.revokeAllForUser(userId, tx);

      if (currentAccessToken) {
        await this.accessTokenRevocationService.revoke(
          {
            jti: currentAccessToken.jti,
            userId,
            sessionId: currentAccessToken.sessionId,
            reason: 'logout_all',
            expiresAt: this.accessTokenExpiry(),
            metadata,
          },
          tx,
        );
      }

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'session_revoked',
          severity: 'medium',
          userId,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            allSessions: true,
            revokedCount: revoked,
          },
        },
        tx,
      );

      return revoked;
    });
  }

  private accessTokenExpiry(): Date {
    return new Date(
      Date.now() + this.tokenService.getAccessTokenTtlSeconds() * 1_000,
    );
  }

  private async revokeOwnedSession(
    tx: DatabaseTransaction,
    session: Session,
    reason: Exclude<Session['revokeReason'], null>,
    metadata: RequestMetadata,
    accessToken?: {
      jti: string;
      reason: AccessTokenRevocation['reason'];
    },
  ): Promise<void> {
    await this.sessionsRepository.revoke(session.id, reason, tx);
    await this.refreshTokensRepository.revokeAllForSession(
      session.id,
      tx,
    );

    if (accessToken) {
      await this.accessTokenRevocationService.revoke(
        {
          jti: accessToken.jti,
          userId: session.userId,
          sessionId: session.id,
          reason: accessToken.reason,
          expiresAt: this.accessTokenExpiry(),
          metadata,
        },
        tx,
      );
    }

    await this.authAuditRepository.recordSecurityEvent(
      {
        type: 'session_revoked',
        severity: 'low',
        userId: session.userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          sessionId: session.id,
          reason,
        },
      },
      tx,
    );
  }
}
