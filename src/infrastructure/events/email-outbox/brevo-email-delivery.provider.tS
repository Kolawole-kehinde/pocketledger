
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import type {
  EmailDeliveryMessage,
  EmailDeliveryProvider,
} from './email-delivery.provider.js';


@Injectable()
export class BrevoEmailDeliveryProvider implements EmailDeliveryProvider {
  private readonly client: BrevoClient;
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('BREVO_API_KEY');
    const senderEmail = configService.get<string>(
      'BREVO_SENDER_EMAIL',
    );

    if (!apiKey || !senderEmail) {
      throw new ServiceUnavailableException(
        'Brevo email delivery configuration is incomplete',
      );
    }

    this.senderEmail = senderEmail;
    this.senderName =
      configService.get<string>('BREVO_SENDER_NAME') ??
      'PocketLedger';

    this.client = new BrevoClient({
      apiKey,
      timeoutInSeconds: 30,
      maxRetries: 2,
    });
  }

  async send(message: EmailDeliveryMessage): Promise<void> {
    await this.client.transactionalEmails.sendTransacEmail({
      sender: {
        email: this.senderEmail,
        name: this.senderName,
      },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
    });
  }
}
