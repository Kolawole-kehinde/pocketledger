import { ConfigService } from '@nestjs/config';
import { Kafka } from 'kafkajs';

export const createKafkaClient = (configService: ConfigService): Kafka => {
  const brokers = configService
    .getOrThrow<string>('KAFKA_BROKERS')
    .split(',')
    .map((broker) => broker.trim());

    return new Kafka({
       clientId: 'pocketledger',
       brokers,
       retry: {
         initialRetryTime: 300,
         retries: Number.MAX_SAFE_INTEGER
       }
    })
};
