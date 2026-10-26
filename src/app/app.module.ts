
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from '../config/env.schema.js';
import { DatabaseModule } from '../database/database.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { KafkaModule } from '../infrastructure/kafka/kafka.module.js';
import { OutboxModule } from '../infrastructure/events/outbox/outbox.module.js';

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
