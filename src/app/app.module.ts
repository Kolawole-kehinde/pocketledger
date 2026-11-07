
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from '../config/env.schema.js';
import { DatabaseModule } from '../infrastructure/database/database.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { KafkaModule } from '../infrastructure/messaging/kafka/kafka.module.js';
import { OutboxModule } from '../infrastructure/messaging/outbox/outbox.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    DatabaseModule,
    KafkaModule,
    OutboxModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
