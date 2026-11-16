import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CacheService } from '../../../infrastructure/cache/cache.service.js';
import {
  getPermissionsForRoles,
  isPermission,
  type Permission,
} from '../permissions.js';
import { normalizeRoles, type Role } from '../roles.js';
import { PermissionOverridesRepository } from '../repositories/permission-overrides.repository.js';

const PERMISSION_CACHE_PREFIX = 'permissions:';
const DEFAULT_TTL_SECONDS = 5 * 60;

/**
 * Resolves and caches the effective permission set for a user.
 *
 * The effective set is the union of permissions granted by all assigned roles
 * with the user's grant/revoke overrides applied. Keys include both the user id
 * and the normalized role set so role changes cannot serve stale permissions.
 */
@Injectable()
export class PermissionCacheService {
  private readonly logger = new Logger(PermissionCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly cacheService: CacheService,
    private readonly permissionOverridesRepository: PermissionOverridesRepository,
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

  async getPermissions(
    userId: string,
    roles: readonly Role[] | Role,
  ): Promise<ReadonlySet<Permission>> {
    const normalized = normalizeRoles(
      Array.isArray(roles) ? roles : [roles],
    );
    const key = this.buildKey(userId, normalized);

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

    const permissions = new Set<Permission>(
      getPermissionsForRoles(normalized),
    );

    try {
      const overrides =
        await this.permissionOverridesRepository.findByUserId(userId);

      for (const override of overrides) {
        if (!isPermission(override.permission)) {
          continue;
        }

        if (override.effect === 'grant') {
          permissions.add(override.permission);
        } else {
          permissions.delete(override.permission);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Permission override lookup failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    try {
      this.cacheService.set(key, [...permissions], this.ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Permission cache write failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return permissions;
  }

  async hasPermission(
    userId: string,
    roles: readonly Role[] | Role,
    permission: Permission,
  ): Promise<boolean> {
    return (await this.getPermissions(userId, roles)).has(permission);
  }

  invalidateUser(userId: string): number {
    return this.cacheService.deleteByPrefix(
      `${PERMISSION_CACHE_PREFIX}${userId}:`,
    );
  }

  invalidateAll(): number {
    return this.cacheService.deleteByPrefix(PERMISSION_CACHE_PREFIX);
  }

  private buildKey(userId: string, roles: readonly Role[]): string {
    return `${PERMISSION_CACHE_PREFIX}${userId}:${roles.join(',')}`;
  }
}
