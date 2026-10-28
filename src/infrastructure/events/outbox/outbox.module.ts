import { Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository.js';
import { OutboxPublisher } from './outbox.publisher.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { KafkaModule } from '../../kafka/kafka.module.js';
import { OutboxPublishingService } from './outbox-publishing.service.js';

@Module({
  imports: [DatabaseModule, KafkaModule],
  providers: [
    OutboxRepository,
    OutboxPublisher,
    OutboxPublishingService
],
  exports: [OutboxRepository],
})
export class OutboxModule {}
