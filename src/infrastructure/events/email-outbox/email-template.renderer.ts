import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { EmailDeliveryMessage } from './email-delivery.provider.js';
import type { EmailOutboxJob } from '../../../database/schema/email-outbox.schema.js';

interface OtpEmailPayload {
  otp: string;
  expiresInMinutes: number;
}

@Injectable()
export class EmailTemplateRenderer {
  render(
    template: EmailOutboxJob['template'],
    recipient: string,
    payload: Record<string, unknown>,
  ): EmailDeliveryMessage {
    switch (template) {
      case 'registration_otp':
        return this.renderOtpEmail(
          recipient,
          payload,
          'Verify your email address',
          'Use this code to complete your registration.',
        );

      case 'login_otp':
        return this.renderOtpEmail(
          recipient,
          payload,
          'Your login verification code',
          'Use this code to sign in to your account.',
        );

      case 'security_notification':
        throw new InternalServerErrorException(
          'Security notification template is not implemented yet',
        );

      default: {
        const exhaustiveCheck: never = template;
        throw new InternalServerErrorException(
          `Unsupported email template: ${exhaustiveCheck}`,
        );
      }
    }
  }

  private renderOtpEmail(
    recipient: string,
    payload: Record<string, unknown>,
    subject: string,
    intro: string,
  ): EmailDeliveryMessage {
    
    const otp = payload.otp;
const expiresInMinutes = payload.expiresInMinutes;

    if (
      typeof otp !== 'string' ||
      !/^\d{6}$/.test(otp) ||
      typeof expiresInMinutes !== 'number' ||
      !Number.isInteger(expiresInMinutes) ||
      expiresInMinutes <= 0
    ) {
      throw new InternalServerErrorException(
        'Invalid OTP email payload',
      );
    }

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>${subject}</h2>
        <p>${intro}</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">
          ${otp}
        </p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
        <p>If you did not request this code, you can ignore this email.</p>
      </div>
    `;

    const text = [
      subject,
      '',
      intro,
      '',
      `Your verification code: ${otp}`,
      `This code expires in ${expiresInMinutes} minutes.`,
      'If you did not request this code, you can ignore this email.',
    ].join('\n');

    return {
      to: recipient,
      subject,
      html,
      text,
    };
  }
}