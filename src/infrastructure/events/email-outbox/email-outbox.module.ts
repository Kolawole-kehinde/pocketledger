
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { EmailOutboxRepository } from './email-outbox.repository.js';
import { EmailPayloadEncryptionService } from './email-payload-encryption.service.js';
import { EmailTemplateRenderer } from './email-template.renderer.js';
import { EmailOutboxWorker } from './email-outbox.worker.js';

import {
  EMAIL_DELIVERY_PROVIDER,
} from './email-delivery.provider.js';

import { SmtpEmailDeliveryProvider } from './smtp-email-delivery.provider.js';
import { BrevoEmailDeliveryProvider } from './brevo-email-delivery.provider.js';

@Module({
  imports: [ConfigModule],
  providers: [
    EmailOutboxRepository,
    EmailPayloadEncryptionService,
    EmailTemplateRenderer,
    EmailOutboxWorker,
    {
      provide: EMAIL_DELIVERY_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const driver = configService.get<string>('EMAIL_DELIVERY_DRIVER') ?? 'smtp';
        switch (driver) {
          case 'smtp':
            return new SmtpEmailDeliveryProvider(configService);

          case 'brevo':
            return new BrevoEmailDeliveryProvider(configService);

          default:
            throw new Error(
              `Unsupported email delivery driver: ${driver}`,
            );
        }
      },
    },
  ],
  exports: [
    EmailOutboxRepository,
    EmailPayloadEncryptionService,
    EMAIL_DELIVERY_PROVIDER,
  ],
})
export class EmailOutboxModule {}
