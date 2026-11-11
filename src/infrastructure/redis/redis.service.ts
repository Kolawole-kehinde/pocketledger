import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private lastErrorLogAt = 0;

  constructor(
    private readonly configService: ConfigService
  ) {
    this.client = new Redis(
      this.configService.getOrThrow<string>('REDIS_URL'),
      {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
      },
    );

    this.client.on('error', (error) => {
      const now = Date.now();

      if (now - this.lastErrorLogAt < 60_000) {
        return;
      }

      this.lastErrorLogAt = now;
      this.logger.warn(
        `Redis connection error: ${error.message}`,
      );
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
