
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import type {
  Session,
} from '../../../infrastructure/database/schema/sessions.schema.js';
import type {
  AccessTokenRevocation,
} from '../../../infrastructure/database/schema/access-token-revocations.schema.js';
import type {
  User,
} from '../../../infrastructure/database/schema/users.schema.js';
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
import type {
  RequestMetadata,
} from '../utils/request-metadata.js';
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
      now.getTime() +
        this.tokenService.getSessionTtlSeconds() * 1_000,
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
      now.getTime() +
        this.tokenService.getRefreshTokenTtlSeconds() * 1_000,
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

  const result = await this.db.transaction(async (tx) => {
    // 1. Discover the owning session without locking the token.
    const discoveredToken =
      await this.refreshTokensRepository.findByHash(
        tokenHash,
        tx,
      );

    if (!discoveredToken) {
      return { status: 'invalid' } as const;
    }

    // 2. Lock the session first.
    const session = await this.sessionsRepository.findById(
      discoveredToken.sessionId,
      tx,
      true,
    );

    if (!session) {
      return { status: 'invalid' } as const;
    }

    // 3. Re-read and lock the token after acquiring the session lock.
    const existing = await this.refreshTokensRepository.findByHash(
      tokenHash,
      tx,
      true,
    );

    if (!existing || existing.sessionId !== session.id) {
      return { status: 'invalid' } as const;
    }

    // 4. Detect reuse only when the revoked token was replaced.
    if (existing.revokedAt) {
      if (!existing.replacedByTokenId) {
        return { status: 'invalid' } as const;
      }

      await this.handleRefreshTokenReuse(
        tx,
        session,
        metadata,
      );

      return { status: 'reuse' } as const;
    }

    // 5. Validate the session and associated user.
    const active = await this.sessionsRepository.findActiveWithUser(
      session.id,
      tx,
    );

    if (!active) {
      await this.refreshTokensRepository.revokeAllForSession(
        session.id,
        tx,
      );

      return { status: 'invalid' } as const;
    }

    // 6. Check refresh-token expiry using PostgreSQL time.
    if (
      await this.refreshTokensRepository.isExpired(
        existing.id,
        tx,
      )
    ) {
      await this.refreshTokensRepository.revoke(
        existing.id,
        tx,
      );

      return { status: 'expired' } as const;
    }

    // 7. Extend the session using PostgreSQL time.
    const touchedSession =
      await this.sessionsRepository.touchWithTtl(
        session.id,
        this.tokenService.getSessionTtlSeconds(),
        tx,
      );

    if (!touchedSession) {
      return { status: 'invalid' } as const;
    }

    // 8. Revoke the old token before inserting its replacement.
    const revoked = await this.refreshTokensRepository.revoke(
      existing.id,
      tx,
    );

    if (!revoked) {
      throw new Error(
        'Refresh token state changed unexpectedly during rotation',
      );
    }

    // 9. Generate and persist the replacement refresh token.
    const nextRefreshToken =
      this.tokenService.generateRefreshToken();

    const nextRecord =
      await this.refreshTokensRepository.createWithTtl(
        session.id,
        this.tokenService.hashRefreshToken(nextRefreshToken),
        this.tokenService.getRefreshTokenTtlSeconds(),
        tx,
      );

    // 10. Link the old token to its replacement.
    const linked =
      await this.refreshTokensRepository.linkReplacement(
        existing.id,
        nextRecord.id,
        tx,
      );

    if (!linked) {
      throw new Error(
        'Could not link the replacement refresh token',
      );
    }

    // 11. Record successful rotation in the same transaction.
    await this.authAuditRepository.recordSecurityEvent(
      {
        type: 'refresh_token_rotated',
        severity: 'low',
        userId: active.user.id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          sessionId: session.id,
        },
      },
      tx,
    );

    // 12. Sign the access token BEFORE the transaction commits.
    // If signing fails, the transaction rolls back, restoring the
    // previous refresh token and removing the replacement.
    const accessToken = await this.tokenService.signAccessToken({
      userId: active.user.id,
      sessionId: session.id,
      email: active.user.email,
      role: active.user.role,
    });

    return {
      status: 'rotated' as const,
      user: active.user,
      sessionId: session.id,
      refreshToken: nextRefreshToken,
      refreshTokenExpiresAt: nextRecord.expiresAt,
      accessToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
    };
  });

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
      return {
        user: result.user,
        sessionId: result.sessionId,
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      };
  }
}


  private async handleRefreshTokenReuse(
    tx: DatabaseTransaction,
    session: Session,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.sessionsRepository.revoke(
      session.id,
      'refresh_token_reuse',
      tx,
    );

    await this.refreshTokensRepository.revokeAllForSession(
      session.id,
      tx,
    );

    await this.authAuditRepository.recordSecurityEvent(
      {
        type: 'refresh_token_reuse_detected',
        severity: 'critical',
        userId: session.userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          sessionId: session.id,
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

      await this.refreshTokensRepository.revokeAllForUser(
        userId,
        tx,
      );

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
      Date.now() +
        this.tokenService.getAccessTokenTtlSeconds() * 1_000,
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
    await this.sessionsRepository.revoke(
      session.id,
      reason,
      tx,
    );

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
