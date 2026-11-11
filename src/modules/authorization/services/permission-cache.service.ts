import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../infrastructure/cache/cache.service.js';
import type { User } from '../../../infrastructure/database/schema/users.schema.js';
import {
  ROLE_PERMISSIONS,
  type Permission,
} from '../permissions.js';

const PERMISSION_CACHE_PREFIX = 'permissions:';
const DEFAULT_TTL_SECONDS = 5 * 60;

/**
 * Caches the resolved permission set for a user.
 *
 * Keys include both the user id and the role, so a role change can never serve
 * the previous role's permissions even for another process. Entries are
 * invalidated explicitly when a user's role/status changes or their access
 * token is revoked. If the cache is unavailable, permissions are computed
 * from the catalog so authorization still fails open to the source of truth.
 */
@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly cacheService: CacheService,
    configService: ConfigService,
  ) {
    const configured = configService.get<number>(
      'PERMISSION_CACHE_TTL_SECONDS',
    );

    this.ttlSeconds =
      typeof configured === 'number' &&
      Number.isFinite(configured) &&
      configured > 0
        ? configured
        : DEFAULT_TTL_SECONDS;
  }

  getPermissions(
    userId: string,
    role: User['role'],
  ): ReadonlySet<Permission> {
    const key = this.buildKey(userId, role);

    try {
      const cached = this.cacheService.get<Permission[]>(key);

      if (cached) {
        return new Set(cached);
      }
    } catch (error) {
      this.logger.warn(
        `Permission cache read failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    const permissions =
      ROLE_PERMISSIONS[role] ?? new Set<Permission>();

    try {
      this.cacheService.set(
        key,
        [...permissions],
        this.ttlSeconds,
      );
    } catch (error) {
      this.logger.warn(
        `Permission cache write failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return permissions;
  }

  hasPermission(
    userId: string,
    role: User['role'],
    permission: Permission,
  ): boolean {
    return this.getPermissions(userId, role).has(permission);
  }

  invalidateUser(userId: string): number {
    return this.cacheService.deleteByPrefix(
      `${PERMISSION_CACHE_PREFIX}${userId}:`,
    );
  }

  invalidateAll(): number {
    return this.cacheService.deleteByPrefix(
      PERMISSION_CACHE_PREFIX,
    );
  }

  private buildKey(
    userId: string,
    role: User['role'],
  ): string {
    return `${PERMISSION_CACHE_PREFIX}${userId}:${role}`;
  }
}
