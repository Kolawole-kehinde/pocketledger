import { Injectable } from '@nestjs/common';
import { EmailOutboxRepository } from '../../../infrastructure/messaging/email-outbox/email-outbox.repository.js';
import { EmailPayloadEncryptionService } from '../../../infrastructure/messaging/email-outbox/email-payload-encryption.service.js';
import type { AuthTransaction } from '../auth.types.js';

interface EnqueueOtpInput {
  recipient: string;
  template: 'registration_otp' | 'login_otp';
  otp: string;
  expiresInMinutes: number;
}

@Injectable()
export class AuthMailerService {
  constructor(
    private readonly emailPayloadEncryptionService: EmailPayloadEncryptionService,
    private readonly emailOutboxRepository: EmailOutboxRepository,
  ) {}

  async enqueueOtp(tx: AuthTransaction, input: EnqueueOtpInput): Promise<void> {
    const encrypted = this.emailPayloadEncryptionService.encrypt({
      otp: input.otp,
      expiresInMinutes: input.expiresInMinutes,
    });

    await this.emailOutboxRepository.enqueue(tx, {
      recipient: input.recipient,
      template: input.template,
      encryptedPayload: encrypted.encryptedPayload,
      encryptionKeyVersion: encrypted.encryptionKeyVersion,
    });
  }

  async cancelPendingOtp(
    tx: AuthTransaction,
    input: {
      recipient: string;
      template: EnqueueOtpInput['template'];
      reason: 'superseded' | 'verified' | 'invalidated';
    },
  ): Promise<number> {
    return this.emailOutboxRepository.cancelPending(tx, {
      recipient: input.recipient,
      template: input.template,
      reason: {
        verified: 'OTP was already verified',
        superseded: 'OTP was superseded by a newer code',
        invalidated: 'OTP is no longer valid',
      }[input.reason],
    });
  }
}
