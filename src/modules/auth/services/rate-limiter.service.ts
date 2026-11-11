import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { AuthAuditRepository } from '../repositories/auth-audit.repository.js';
import { AUTH_MESSAGES } from '../auth.constants.js';
import { authRateLimited } from '../utils/auth-errors.js';

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitContext {
  action: string;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly authAuditRepository: AuthAuditRepository,
  ) {}

  async enforce(
    rules: RateLimitRule[],
    context: RateLimitContext,
  ): Promise<void> {
    for (const rule of rules) {
      const result = await this.consume(rule);

      if (result.allowed) {
        continue;
      }

      void this.authAuditRepository
        .recordSecurityEvent({
          type: 'rate_limit_exceeded',
          severity: 'medium',
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          metadata: {
            action: context.action,
            scope: rule.key,
            email: context.email ?? null,
            retryAfterSeconds: result.retryAfterSeconds,
          },
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to record rate limit security event: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });

      throw authRateLimited(
        AUTH_MESSAGES.rateLimited,
        result.retryAfterSeconds,
      );
    }
  }

  private async consume(rule: RateLimitRule): Promise<RateLimitResult> {
    try {
      const client = this.redisService.getClient();
      const key = `auth:rate-limit:${rule.key}`;
      const count = await client.incr(key);

      if (count === 1) {
        await client.expire(key, rule.windowSeconds);
      }

      if (count <= rule.limit) {
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const ttl = await client.ttl(key);

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, ttl),
      };
    } catch (error) {
      // Redis is a defence-in-depth layer. PostgreSQL-backed OTP attempt and
      // cooldown limits remain authoritative, so availability wins here.
      this.logger.warn(
        `Redis rate limiter unavailable, allowing request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}
