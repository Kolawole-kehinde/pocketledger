
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KAFKA_PRODUCER } from './kafka.constants.js';
import { KafkaService } from './kafka.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    KafkaService,
    {
      provide: KAFKA_PRODUCER,
      useFactory: (kafkaService: KafkaService) =>
        kafkaService.getProducer(),
      inject: [KafkaService],
    },
  ],
  exports: [KAFKA_PRODUCER, KafkaService],
})
export class KafkaModule {}
