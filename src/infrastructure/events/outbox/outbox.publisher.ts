
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Database } from '../../../database/database.types.js';
import { DATABASE } from '../../../database/database.provider.js';

import type { Producer } from 'kafkajs';
import { KAFKA_PRODUCER } from '../../kafka/kafka.constants.js';

@Injectable()
export class OutboxPublisher {
  private readonly workerId: string;
  private readonly batchSize = 100;
  private readonly leaseDurationMs = 60_000;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KAFKA_PRODUCER) private readonly producer: Producer,
    private readonly configService: ConfigService,
  ) {
    this.workerId =
      `${this.configService.get<string>('HOSTNAME') ?? 'pocketledger'}-${process.pid}`;
  }
}
