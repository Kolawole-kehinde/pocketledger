import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '../../../infrastructure/database/database.types.js';
import type { AccessTokenRevocation } from '../../../infrastructure/database/schema/access-token-revocations.schema.js';
import { PermissionCacheService } from '../../authorization/services/permission-cache.service.js';
import { AuthAuditRepository } from '../repositories/auth-audit.repository.js';
import { AccessTokenRevocationsRepository } from '../repositories/access-token-revocations.repository.js';
import type { RequestMetadata } from '../utils/request-metadata.js';

export interface RevokeAccessTokenInput {
  jti: string;
  userId: string;
  sessionId: string | null;
  reason: AccessTokenRevocation['reason'];
  expiresAt: Date;
  metadata?: RequestMetadata;
}

@Injectable()
export class AccessTokenRevocationService {
  constructor(
    private readonly accessTokenRevocationsRepository: AccessTokenRevocationsRepository,
    private readonly authAuditRepository: AuthAuditRepository,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  async isRevoked(jti: string): Promise<boolean> {
    return this.accessTokenRevocationsRepository.exists(jti);
  }

  async revoke(
    input: RevokeAccessTokenInput,
    tx?: DatabaseTransaction,
  ): Promise<boolean> {
    const revoked =
      await this.accessTokenRevocationsRepository.revoke(
        {
          jti: input.jti,
          userId: input.userId,
          sessionId: input.sessionId,
          reason: input.reason,
          expiresAt: input.expiresAt,
          userAgent: input.metadata?.userAgent ?? null,
          ipAddress: input.metadata?.ipAddress ?? null,
        },
        tx,
      );

    if (revoked) {
      this.permissionCacheService.invalidateUser(input.userId);

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'access_token_revoked',
          severity: 'low',
          userId: input.userId,
          ipAddress: input.metadata?.ipAddress ?? null,
          userAgent: input.metadata?.userAgent ?? null,
          metadata: {
            sessionId: input.sessionId,
            reason: input.reason,
          },
        },
        tx,
      );
    }

    return revoked;
  }
}
