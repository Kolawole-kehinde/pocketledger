import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import type {
  AuthTransaction,
  OtpIssueResult,
  OtpPurpose,
  OtpVerificationResult,
} from '../auth.types.js';
import { OtpChallengesRepository } from '../repositories/otp-challenges.repository.js';
import {
  constantTimeEqualHex,
  hashOtp,
} from '../utils/token-hash.js';

@Injectable()
export class OtpService {
  constructor(
    private readonly otpChallengesRepository: OtpChallengesRepository,
    private readonly configService: ConfigService,
  ) {}

  private getOtpTtlSeconds(): number {
    return this.configService.getOrThrow<number>('OTP_TTL_SECONDS');
  }

  private getMaxAttempts(): number {
    return this.configService.getOrThrow<number>('OTP_MAX_ATTEMPTS');
  }

  private getCooldownSeconds(): number {
    return this.configService.getOrThrow<number>(
      'OTP_RESEND_COOLDOWN_SECONDS',
    );
  }

  private getHashSecret(): string {
    return this.configService.getOrThrow<string>('OTP_HASH_SECRET');
  }

  async getCooldown(
    email: string,
    purpose: OtpPurpose,
    tx?: AuthTransaction,
  ): Promise<number | null> {
    const latest = await this.otpChallengesRepository.findLatest(
      email,
      purpose,
      tx,
    );

    if (!latest) {
      return null;
    }

    const cooldownMs = this.getCooldownSeconds() * 1_000;

    if (cooldownMs <= 0) {
      return null;
    }

    const elapsedMs = Date.now() - latest.createdAt.getTime();

    if (elapsedMs >= cooldownMs) {
      return null;
    }

    return Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1_000));
  }

  async issue(
    email: string,
    purpose: OtpPurpose,
    tx: AuthTransaction,
  ): Promise<OtpIssueResult> {
    const retryAfterSeconds = await this.getCooldown(
      email,
      purpose,
      tx,
    );

    if (retryAfterSeconds !== null) {
      return {
        status: 'cooldown',
        retryAfterSeconds,
      };
    }

    // A new challenge invalidates any previous unused challenge.
    await this.otpChallengesRepository.consumeActive(
      email,
      purpose,
      tx,
    );

    const otp = this.generateOtp();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.getOtpTtlSeconds() * 1_000,
    );

    await this.otpChallengesRepository.create(
      {
        email,
        purpose,
        codeHash: this.hash(email, purpose, otp),
        expiresAt,
        maxAttempts: this.getMaxAttempts(),
      },
      tx,
    );

    return {
      status: 'issued',
      otp,
      expiresAt,
      expiresInMinutes: Math.max(
        1,
        Math.ceil(this.getOtpTtlSeconds() / 60),
      ),
    };
  }

  async verify(
    email: string,
    purpose: OtpPurpose,
    otp: string,
    tx: AuthTransaction,
  ): Promise<OtpVerificationResult> {
    const challenge =
      await this.otpChallengesRepository.findLatest(
        email,
        purpose,
        tx,
        true,
      );

    if (!challenge) {
      return { status: 'not_found' };
    }

    if (challenge.consumedAt) {
      return {
        status: 'already_used',
        challengeId: challenge.id,
      };
    }

    const now = new Date();

    if (challenge.expiresAt.getTime() <= now.getTime()) {
      await this.otpChallengesRepository.consume(challenge.id, tx);

      return {
        status: 'expired',
        challengeId: challenge.id,
      };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await this.otpChallengesRepository.consume(challenge.id, tx);

      return {
        status: 'too_many_attempts',
        challengeId: challenge.id,
      };
    }

    const expectedHash = this.hash(email, purpose, otp);

    if (!constantTimeEqualHex(expectedHash, challenge.codeHash)) {
      const updated =
        await this.otpChallengesRepository.incrementAttempts(
          challenge.id,
          tx,
        );

      if (
        updated &&
        updated.attempts >= updated.maxAttempts
      ) {
        await this.otpChallengesRepository.consume(
          challenge.id,
          tx,
        );

        return {
          status: 'too_many_attempts',
          challengeId: challenge.id,
        };
      }

      return {
        status: 'invalid',
        challengeId: challenge.id,
      };
    }

    const consumed = await this.otpChallengesRepository.consume(
      challenge.id,
      tx,
    );

    if (!consumed) {
      return {
        status: 'already_used',
        challengeId: challenge.id,
      };
    }

    return {
      status: 'verified',
      challengeId: challenge.id,
    };
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hash(
    email: string,
    purpose: OtpPurpose,
    otp: string,
  ): string {
    return hashOtp(email, purpose, otp, this.getHashSecret());
  }
}
