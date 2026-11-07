import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  EmailDeliveryMessage,
  EmailDeliveryProvider,
} from './email-delivery.provider.js';

@Injectable()
export class SmtpEmailDeliveryProvider implements EmailDeliveryProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const host = configService.get<string>('SMTP_HOST');
    const port = configService.get<number>('SMTP_PORT');
    const user = configService.get<string>('SMTP_USER');
    const pass = configService.get<string>('SMTP_PASSWORD');
    const from = configService.get<string>('SMTP_FROM');

    if (!host || !port || !user || !pass || !from) {
      throw new ServiceUnavailableException(
        'SMTP email delivery configuration is incomplete',
      );
    }

    this.from = from;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async send(message: EmailDeliveryMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}