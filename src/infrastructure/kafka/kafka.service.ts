
import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Producer } from 'kafkajs';
import { createKafkaClient } from './kafka.config.js';

@Injectable()
export class KafkaService implements OnModuleInit, OnApplicationShutdown {
  private readonly producer: Producer;

  constructor(configService: ConfigService) {
    const kafka = createKafkaClient(configService);

    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.producer.disconnect();
  }

  getProducer(): Producer {
    return this.producer;
  }
}
