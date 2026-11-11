import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import { OutboxRepository } from '../../../infrastructure/messaging/outbox/outbox.repository.js';
import { UsersRepository } from '../../users/users.repository.js';
import {
  AUTH_MESSAGES,
  AUTH_RATE_LIMITS,
  USER_REGISTERED_EVENT,
} from '../auth.constants.js';
import type { OtpVerificationStatus } from '../auth.types.js';
import { OtpRequestedResponseDto } from '../dto/auth-response.dto.js';
import { PendingRegistrationsRepository } from '../repositories/pending-registrations.repository.js';
import { AuthAuditRepository } from '../repositories/auth-audit.repository.js';
import type { CompleteRegistrationInput } from '../schemas/auth.schemas.js';
import {
  authBadRequest,
  authConflict,
  authUnauthorized,
} from '../utils/auth-errors.js';
import { getUserUniqueField } from '../utils/postgres-error.js';
import type { RequestMetadata } from '../utils/request-metadata.js';
import { AuthMailerService } from './auth-mailer.service.js';
import { OtpService } from './otp.service.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import type {
  RegistrationTokenPayload,
  SessionWithTokens,
} from '../auth.types.js';
import type { User } from '../../../infrastructure/database/schema/users.schema.js';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly pendingRegistrationsRepository: PendingRegistrationsRepository,
    private readonly otpService: OtpService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly authMailerService: AuthMailerService,
    private readonly authAuditRepository: AuthAuditRepository,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  private getOtpTtlMinutes(): number {
    return Math.max(
      1,
      Math.ceil(this.configService.getOrThrow<number>('OTP_TTL_SECONDS') / 60),
    );
  }

  private getRegistrationTtlSeconds(): number {
    return this.configService.getOrThrow<number>('REGISTRATION_TTL_SECONDS');
  }

  async requestRegistration(
    email: string,
    metadata: RequestMetadata,
  ): Promise<OtpRequestedResponseDto> {
    const ip = metadata.ipAddress ?? 'unknown';

    await this.rateLimiterService.enforce(
      [
        {
          key: `register:ip:${ip}`,
          ...AUTH_RATE_LIMITS.registerIp,
        },
        {
          key: `register:email:${email}`,
          ...AUTH_RATE_LIMITS.registerEmail,
        },
      ],
      {
        action: 'register',
        email,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    );

    const outcome = await this.db.transaction(async (tx) => {
      const existingUser = await this.usersRepository.findByEmail(email, tx);

      // Do not reveal whether the address already belongs to an account.
      if (existingUser) {
        return { status: 'ignored' as const };
      }

      const now = new Date();

      await this.pendingRegistrationsRepository.upsert(
        email,
        new Date(now.getTime() + this.getRegistrationTtlSeconds() * 1_000),
        tx,
      );

      const issued = await this.otpService.issue(email, 'registration', tx);

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
        template: 'registration_otp',
        reason: 'superseded',
      });

      await this.authMailerService.enqueueOtp(tx, {
        recipient: email,
        template: 'registration_otp',
        otp: issued.otp,
        expiresInMinutes: issued.expiresInMinutes,
      });

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'otp_requested',
          severity: 'low',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            purpose: 'registration',
            email,
          },
        },
        tx,
      );

      return { status: 'issued' as const };
    });

    return new OtpRequestedResponseDto({
      message: AUTH_MESSAGES.registrationRequested,
      expiresInMinutes: this.getOtpTtlMinutes(),
      resendAfterSeconds:
        outcome.status === 'cooldown' ? outcome.retryAfterSeconds : undefined,
    });
  }

  async verifyRegistrationOtp(
    email: string,
    otp: string,
    metadata: RequestMetadata,
  ): Promise<{
    registrationToken: string;
    expiresInSeconds: number;
  }> {
    const ip = metadata.ipAddress ?? 'unknown';

    await this.rateLimiterService.enforce(
      [
        {
          key: `register-verify:ip:${ip}`,
          ...AUTH_RATE_LIMITS.otpVerifyIp,
        },
        {
          key: `register-verify:email:${email}`,
          ...AUTH_RATE_LIMITS.otpVerifyEmail,
        },
      ],
      {
        action: 'register.verify',
        email,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    );

    const outcome = await this.db.transaction(async (tx) => {
      const verification = await this.otpService.verify(
        email,
        'registration',
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
            template: 'registration_otp',
            reason: 'invalidated',
          });
        }

        await this.recordOtpFailure(tx, email, verification.status, metadata);

        return { status: verification.status };
      }

      // The code has been consumed, so a queued email for it is now useless.
      await this.authMailerService.cancelPendingOtp(tx, {
        recipient: email,
        template: 'registration_otp',
        reason: 'verified',
      });

      const pending = await this.pendingRegistrationsRepository.findByEmail(
        email,
        tx,
        true,
      );
      const now = new Date();

      if (!pending || pending.expiresAt.getTime() <= now.getTime()) {
        return { status: 'not_found' as const };
      }

      const updated =
        await this.pendingRegistrationsRepository.markEmailVerified(
          pending.id,
          new Date(now.getTime() + this.getRegistrationTtlSeconds() * 1_000),
          tx,
        );

      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'otp_verified',
          severity: 'low',
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            purpose: 'registration',
            email,
            pendingRegistrationId: pending.id,
          },
        },
        tx,
      );

      return {
        status: 'verified' as const,
        pendingRegistration: updated ?? pending,
      };
    });

    if (outcome.status !== 'verified') {
      throw this.mapOtpFailure(outcome.status);
    }

    const registrationToken = await this.tokenService.signRegistrationToken({
      pendingRegistrationId: outcome.pendingRegistration.id,
      email: outcome.pendingRegistration.email,
    });

    return {
      registrationToken,
      expiresInSeconds: this.tokenService.getRegistrationTokenTtlSeconds(),
    };
  }

  async completeRegistration(
    registrationToken: string,
    input: CompleteRegistrationInput,
    metadata: RequestMetadata,
  ): Promise<SessionWithTokens & { user: User }> {
    const ip = metadata.ipAddress ?? 'unknown';

    await this.rateLimiterService.enforce(
      [
        {
          key: `register-complete:ip:${ip}`,
          ...AUTH_RATE_LIMITS.completeRegistrationIp,
        },
      ],
      {
        action: 'register.complete',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    );

    let payload: RegistrationTokenPayload;

    try {
      payload =
        await this.tokenService.verifyRegistrationToken(registrationToken);
    } catch (error) {
      await this.recordSuspiciousActivity(
        metadata,
        'invalid_registration_token',
      );

      throw error;
    }

    let outcome: {
      status: 'invalid_token' | 'registration_expired' | 'created';
      user?: User;
      created?: Awaited<ReturnType<SessionService['createSession']>>;
    };

    try {
      outcome = await this.db.transaction(async (tx) => {
        const pending = await this.pendingRegistrationsRepository.findById(
          payload.sub,
          tx,
          true,
        );
        const now = new Date();

        if (!pending) {
          await this.recordSuspiciousActivity(
            metadata,
            'unknown_registration',
            tx,
          );

          return { status: 'registration_expired' as const };
        }

        if (pending.email !== payload.email) {
          await this.recordSuspiciousActivity(
            metadata,
            'registration_email_mismatch',
            tx,
          );

          return { status: 'invalid_token' as const };
        }

        if (
          !pending.emailVerifiedAt ||
          pending.expiresAt.getTime() <= now.getTime()
        ) {
          await this.recordSuspiciousActivity(
            metadata,
            'expired_registration',
            tx,
          );

          return { status: 'registration_expired' as const };
        }

        if (await this.usersRepository.findByUsername(input.username, tx)) {
          throw authConflict(
            'USERNAME_TAKEN',
            'This username is already taken',
          );
        }

        if (
          await this.usersRepository.findByPhoneNumber(input.phoneNumber, tx)
        ) {
          throw authConflict(
            'PHONE_NUMBER_TAKEN',
            'This phone number is already in use',
          );
        }

        const user = await this.usersRepository.create(
          {
            email: pending.email,
            firstName: input.firstName,
            lastName: input.lastName,
            middleName: input.middleName ?? null,
            username: input.username,
            phoneNumber: input.phoneNumber,
            role: 'customer',
            status: 'active',
          },
          tx,
        );

        const created = await this.sessionService.createSession(
          tx,
          user,
          metadata,
        );

        await this.pendingRegistrationsRepository.deleteById(pending.id, tx);

        await this.outboxRepository.enqueue(tx, {
          eventType: USER_REGISTERED_EVENT,
          aggregateType: 'user',
          aggregateId: user.id,
          payload: {
            userId: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            registeredAt: user.createdAt.toISOString(),
          },
        });

        await this.authAuditRepository.recordSecurityEvent(
          {
            type: 'registration_completed',
            severity: 'medium',
            userId: user.id,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            metadata: {
              sessionId: created.session.id,
            },
          },
          tx,
        );

        return { status: 'created' as const, user, created };
      });
    } catch (error) {
      const uniqueField = getUserUniqueField(error);

      if (uniqueField === 'username') {
        throw authConflict('USERNAME_TAKEN', 'This username is already taken');
      }

      if (uniqueField === 'phoneNumber') {
        throw authConflict(
          'PHONE_NUMBER_TAKEN',
          'This phone number is already in use',
        );
      }

      if (uniqueField === 'email') {
        throw authConflict(
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists',
        );
      }

      throw error;
    }

    if (outcome.status === 'registration_expired') {
      throw authUnauthorized(
        'REGISTRATION_EXPIRED',
        AUTH_MESSAGES.registrationExpired,
      );
    }

    if (outcome.status !== 'created' || !outcome.user || !outcome.created) {
      throw authUnauthorized(
        'INVALID_REGISTRATION_TOKEN',
        AUTH_MESSAGES.invalidRegistrationToken,
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

  private async recordSuspiciousActivity(
    metadata: RequestMetadata,
    reason: string,
    tx?: DatabaseTransaction,
  ): Promise<void> {
    try {
      await this.authAuditRepository.recordSecurityEvent(
        {
          type: 'suspicious_activity_detected',
          severity: 'medium',
          userId: null,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          metadata: {
            reason,
          },
        },
        tx,
      );
    } catch (error) {
      // Never let an audit failure mask the authentication error itself.
      this.logger.warn(
        `Failed to record ${reason} security event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async recordOtpFailure(
    tx: DatabaseTransaction,
    email: string,
    status: OtpVerificationStatus,
    metadata: RequestMetadata,
  ): Promise<void> {
    await this.authAuditRepository.recordSecurityEvent(
      {
        type: 'otp_verification_failed',
        severity: 'medium',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          purpose: 'registration',
          email,
          reason: status,
        },
      },
      tx,
    );
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
