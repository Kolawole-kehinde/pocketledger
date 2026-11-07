import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../src/infrastructure/database/database.module.js';
import { EmailOutboxModule } from '../src/infrastructure/messaging/email-outbox/email-outbox.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    EmailOutboxModule,
  ],
})
export class EmailOutboxIntegrationModule {}