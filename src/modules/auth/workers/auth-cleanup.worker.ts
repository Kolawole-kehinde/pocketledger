import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type { Database } from '../../../infrastructure/database/database.types.js';
import { AUTH_CLEANUP } from '../auth.constants.js';
import { AccessTokenRevocationsRepository } from '../repositories/access-token-revocations.repository.js';
import { OtpChallengesRepository } from '../repositories/otp-challenges.repository.js';
import { PendingRegistrationsRepository } from '../repositories/pending-registrations.repository.js';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository.js';
import { SessionsRepository } from '../repositories/sessions.repository.js';

@Injectable()
export class AuthCleanupWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AuthCleanupWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | undefined;
  private stopping = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly pendingRegistrationsRepository: PendingRegistrationsRepository,
    private readonly otpChallengesRepository: OtpChallengesRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly accessTokenRevocationsRepository: AccessTokenRevocationsRepository,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<boolean>('AUTH_CLEANUP_ENABLED') ?? true;

    if (!enabled) {
      return;
    }

    const intervalMs = this.configService.getOrThrow<number>(
      'AUTH_CLEANUP_INTERVAL_MS',
    );

    void this.run();
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.inFlight;
  }

  private async run(): Promise<void> {
    if (this.stopping || this.inFlight) {
      return;
    }

    const task = this.cleanup();

    this.inFlight = task;

    try {
      await task;
    } finally {
      if (this.inFlight === task) {
        this.inFlight = undefined;
      }
    }
  }

  private async cleanup(): Promise<void> {
    const now = new Date();
    const consumedBefore = new Date(
      now.getTime() -
        AUTH_CLEANUP.consumedOtpRetentionSeconds * 1_000,
    );
    const revokedBefore = new Date(
      now.getTime() -
        AUTH_CLEANUP.revokedRefreshTokenRetentionSeconds * 1_000,
    );

    try {
      const counts = await this.db.transaction(async (tx) => {
        const pendingRegistrations =
          await this.pendingRegistrationsRepository.deleteExpired(
            now,
            tx,
          );
        const otpChallenges =
          await this.otpChallengesRepository.deleteExpired(
            now,
            consumedBefore,
            tx,
          );
        const sessions = await this.sessionsRepository.revokeExpired(
          now,
          tx,
        );
        const refreshTokens =
          await this.refreshTokensRepository.deleteExpired(
            now,
            revokedBefore,
            tx,
          );
        const accessTokenRevocations =
          await this.accessTokenRevocationsRepository.deleteExpired(
            now,
            tx,
          );

        return {
          pendingRegistrations,
          otpChallenges,
          sessions,
          refreshTokens,
          accessTokenRevocations,
        };
      });

      if (
        counts.pendingRegistrations > 0 ||
        counts.otpChallenges > 0 ||
        counts.sessions > 0 ||
        counts.refreshTokens > 0 ||
        counts.accessTokenRevocations > 0
      ) {
        this.logger.log(
          `Auth cleanup removed ${counts.pendingRegistrations} pending registration(s), ` +
            `${counts.otpChallenges} OTP challenge(s), ${counts.refreshTokens} refresh token(s), ` +
            `${counts.accessTokenRevocations} access token revocation(s), ` +
            `and revoked ${counts.sessions} expired session(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Auth cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
