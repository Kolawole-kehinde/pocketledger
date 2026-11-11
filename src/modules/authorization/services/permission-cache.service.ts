import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../infrastructure/cache/cache.service.js';
import type { User } from '../../../infrastructure/database/schema/users.schema.js';
import {
  ROLE_PERMISSIONS,
  isPermission,
  type Permission,
} from '../permissions.js';
import { PermissionOverridesRepository } from '../repositories/permission-overrides.repository.js';

const PERMISSION_CACHE_PREFIX = 'permissions:';
const DEFAULT_TTL_SECONDS = 5 * 60;

/**
 * Resolves and caches the effective permission set for a user.
 *
 * The effective set is the role permission matrix with the user's
 * grant/revoke overrides applied. Keys include both the user id and the role,
 * so a role change can never serve the previous role's permissions. Entries
 * are invalidated explicitly when a user's role, status or overrides change.
 *
 * If the override lookup fails, resolution falls back to the role baseline so
 * authorization continues to use the source of truth in the catalog.
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
    role: User['role'],
  ): Promise<ReadonlySet<Permission>> {
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

    const permissions = new Set<Permission>(
      ROLE_PERMISSIONS[role] ?? [],
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

  async hasPermission(
    userId: string,
    role: User['role'],
    permission: Permission,
  ): Promise<boolean> {
    return (await this.getPermissions(userId, role)).has(permission);
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
