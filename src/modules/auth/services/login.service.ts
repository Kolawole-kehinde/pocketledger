import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type { Database } from '../../../infrastructure/database/database.types.js';
import type { LoginAttempt } from '../../../infrastructure/database/schema/login-attempts.schema.js';
import type { User } from '../../../infrastructure/database/schema/users.schema.js';
import { UsersRepository } from '../../users/users.repository.js';
import { AUTH_MESSAGES, AUTH_RATE_LIMITS } from '../auth.constants.js';
import type {
  OtpVerificationStatus,
  SessionWithTokens,
} from '../auth.types.js';
import { OtpRequestedResponseDto } from '../dto/auth-response.dto.js';
import { AuthAuditRepository } from '../repositories/auth-audit.repository.js';
import { authBadRequest, authForbidden } from '../utils/auth-errors.js';
import type { RequestMetadata } from '../utils/request-metadata.js';
import { AuthMailerService } from './auth-mailer.service.js';
import { OtpService } from './otp.service.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

@Injectable()
export class LoginService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly otpService: OtpService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly authMailerService: AuthMailerService,
    private readonly authAuditRepository: AuthAuditRepository,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
  ) {}

  private getOtpTtlMinutes(): number {
    return Math.max(
      1,
      Math.ceil(this.configService.getOrThrow<number>('OTP_TTL_SECONDS') / 60),
    );
  }

  async requestLogin(
    email: string,
    metadata: RequestMetadata,
  ): Promise<OtpRequestedResponseDto> {
    const ip = metadata.ipAddress ?? 'unknown';

    await this.rateLimiterService.enforce(
      [
        {
          key: `login:ip:${ip}`,
          ...AUTH_RATE_LIMITS.loginIp,
        },
        {
          key: `login:email:${email}`,
          ...AUTH_RATE_LIMITS.loginEmail,
        },
      ],
      {
        action: 'login',
        email,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    );

    const outcome = await this.db.transaction(async (tx) => {
      const user = await this.usersRepository.findByEmail(email, tx);

      // Never reveal whether an active account exists for this address. The
      // response stays intentionally vague, but security operators still need
      // to see attempts against unknown or unavailable accounts.
      if (!user || user.status !== 'active') {
        await this.authAuditRepository.recordSecurityEvent(
          {
            type: 'login_failed',
            severity: 'low',
            userId: user?.id ?? null,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              email,
              reason: user ? 'account_unavailable' : 'account_not_found',
            },
          },
          tx,
        );

        return { status: 'ignored' as const };
      }

      const issued = await this.otpService.issue(email, 'login', tx);

      if (issued.status === 'cooldown') {
        return {
          status: 'cooldown' as const,
          retryAfterSeconds: issued.retryAfterSeconds,
        };
      }

      // Invalidate any older queued email so the recipient never receives a
      // code that has already been superseded.
      await this.authMailerService.cancelPendingOtp(tx, {
        recipient: email,
        template: 'login_otp',
        reason: 'superseded',
      });

      await this.authMailerService.enqueueOtp(tx, {
        recipient: email,
        template: 'login_otp',
        otp: issued.otp,
        expiresInMinutes: issued.expiresInMinutes,
      });

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'otp_requested',
          severity: 'low',
          userId: user.id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            purpose: 'login',
            email,
          },
        },
        tx,
      );

      return { status: 'issued' as const };
    });

    return new OtpRequestedResponseDto({
      message: AUTH_MESSAGES.loginRequested,
      expiresInMinutes: this.getOtpTtlMinutes(),
      resendAfterSeconds:
        outcome.status === 'cooldown' ? outcome.retryAfterSeconds : undefined,
    });
  }

  async verifyLoginOtp(
    email: string,
    otp: string,
    metadata: RequestMetadata,
  ): Promise<SessionWithTokens & { user: User }> {
    const ip = metadata.ipAddress ?? 'unknown';

    await this.rateLimiterService.enforce(
      [
        {
          key: `login-verify:ip:${ip}`,
          ...AUTH_RATE_LIMITS.otpVerifyIp,
        },
        {
          key: `login-verify:email:${email}`,
          ...AUTH_RATE_LIMITS.otpVerifyEmail,
        },
      ],
      {
        action: 'login.verify',
        email,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    );

    const outcome = await this.db.transaction(async (tx) => {
      const verification = await this.otpService.verify(
        email,
        'login',
        otp,
        tx,
      );

      if (verification.status !== 'verified') {
        if (
          verification.status === 'expired' ||
          verification.status === 'too_many_attempts'
        ) {
          await this.authMailerService.cancelPendingOtp(tx, {
            recipient: email,
            template: 'login_otp',
            reason: 'invalidated',
          });
        }

        const reason = this.toFailureReason(verification.status);

        await this.authAuditRepository.recordLoginAttempt(
          {
            email,
            success: false,
            failureReason: reason,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          },
          tx,
        );

        await this.authAuditRepository.recordSecurityEvent(
          {
            type: 'otp_verification_failed',
            severity: 'medium',
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              purpose: 'login',
              email,
              reason: verification.status,
            },
          },
          tx,
        );

        const failedUser = await this.usersRepository.findByEmail(
          email,
          tx,
        );

        await this.authAuditRepository.recordSecurityEvent(
          {
            type: 'login_failed',
            severity: 'medium',
            userId: failedUser?.id ?? null,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              email,
              reason: verification.status,
            },
          },
          tx,
        );

        return {
          status: 'otp_failed' as const,
          verificationStatus: verification.status,
        };
      }

      // The code has been consumed, so a queued email for it is now useless.
      await this.authMailerService.cancelPendingOtp(tx, {
        recipient: email,
        template: 'login_otp',
        reason: 'verified',
      });

      const user = await this.usersRepository.findByEmail(email, tx);

      if (!user || user.status !== 'active') {
        await this.authAuditRepository.recordLoginAttempt(
          {
            userId: user?.id ?? null,
            email,
            success: false,
            failureReason: 'account_unavailable',
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          },
          tx,
        );

        await this.authAuditRepository.recordSecurityEvent(
          {
            type: 'login_failed',
            severity: 'medium',
            userId: user?.id ?? null,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              email,
              reason: 'account_unavailable',
            },
          },
          tx,
        );

        return { status: 'unavailable' as const };
      }

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'otp_verified',
          severity: 'low',
          userId: user.id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            purpose: 'login',
            email,
          },
        },
        tx,
      );

      const created = await this.sessionService.createSession(
        tx,
        user,
        metadata,
      );

      await this.authAuditRepository.recordLoginAttempt(
        {
          userId: user.id,
          email,
          success: true,
          failureReason: null,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
        tx,
      );

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'login_succeeded',
          severity: 'low',
          userId: user.id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            sessionId: created.session.id,
          },
        },
        tx,
      );

      return { status: 'authenticated' as const, user, created };
    });

    if (outcome.status === 'otp_failed') {
      throw this.mapOtpFailure(outcome.verificationStatus);
    }

    if (outcome.status === 'unavailable') {
      throw authForbidden(
        'ACCOUNT_UNAVAILABLE',
        AUTH_MESSAGES.accountUnavailable,
      );
    }

    const tokens = await this.sessionService.signSessionAccessToken(
      outcome.created,
      outcome.user,
    );

    return {
      ...tokens,
      user: outcome.user,
    };
  }

  private toFailureReason(
    status: OtpVerificationStatus,
  ): LoginAttempt['failureReason'] {
    switch (status) {
      case 'expired':
        return 'otp_expired';

      case 'already_used':
        return 'otp_already_used';

      case 'too_many_attempts':
        return 'too_many_attempts';

      default:
        return 'invalid_otp';
    }
  }

  private mapOtpFailure(status: OtpVerificationStatus): Error {
    switch (status) {
      case 'expired':
        return authBadRequest('OTP_EXPIRED', AUTH_MESSAGES.invalidOtp);

      case 'too_many_attempts':
        return authBadRequest(
          'OTP_ATTEMPTS_EXCEEDED',
          AUTH_MESSAGES.invalidOtp,
        );

      case 'already_used':
        return authBadRequest('OTP_ALREADY_USED', AUTH_MESSAGES.invalidOtp);

      default:
        return authBadRequest('INVALID_OTP', AUTH_MESSAGES.invalidOtp);
    }
  }
}
