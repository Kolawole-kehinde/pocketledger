
import { Injectable, InternalServerErrorException} from '@nestjs/common';
import type { EmailDeliveryMessage } from './email-delivery.provider.js';
import type { EmailOutboxJob } from '../../../database/schema/email-outbox.schema.js';
import { OtpEmailPayloadSchema,SecurityNotificationPayloadSchema} from './email-template.validation.js';

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
        return this.renderSecurityNotification(recipient, payload);

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
    const result = OtpEmailPayloadSchema.safeParse(payload);

    if (!result.success) {
      throw new InternalServerErrorException(
        'Invalid OTP email payload',
      );
    }

    const { otp, expiresInMinutes } = result.data;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>${this.escapeHtml(subject)}</h2>
        <p>${this.escapeHtml(intro)}</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">
          ${this.escapeHtml(otp)}
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

  private renderSecurityNotification(
    recipient: string,
    payload: Record<string, unknown>,
  ): EmailDeliveryMessage {
    const result = SecurityNotificationPayloadSchema.safeParse(payload);

    if (!result.success) {
      throw new InternalServerErrorException(
        'Invalid security notification payload',
      );
    }

    const data = result.data;
    const subject = data.title.replace(/[\r\n]/g, ' ').trim();

    const details = [
      `Event: ${data.eventType.replaceAll('_', ' ')}`,
      `Time: ${new Date(data.occurredAt).toUTCString()}`,
      ...(data.ipAddress ? [`IP address: ${data.ipAddress}`] : []),
      ...(data.device ? [`Device: ${data.device}`] : []),
    ];

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>${this.escapeHtml(data.title)}</h2>

        <p>${this.escapeHtml(data.message)}</p>

        <h3>Event details</h3>

        <ul>
          ${details
            .map((detail) => `<li>${this.escapeHtml(detail)}</li>`)
            .join('')}
        </ul>

        <p>
          If you did not perform this action, please secure your account
          immediately.
        </p>
      </div>
    `;

    const text = [
      data.title,
      '',
      data.message,
      '',
      'Event details:',
      ...details,
      '',
      'If you did not perform this action, please secure your account immediately.',
    ].join('\n');

    return {
      to: recipient,
      subject,
      html,
      text,
    };
  }

  private escapeHtml(value: string): string {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return value.replace(/[&<>"']/g, (character) => entities[character]);
  }
}
