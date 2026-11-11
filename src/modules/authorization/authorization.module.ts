import { Module } from '@nestjs/common';
import { CacheModule } from '../../infrastructure/cache/cache.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { PermissionOverridesRepository } from './repositories/permission-overrides.repository.js';
import { PermissionCacheService } from './services/permission-cache.service.js';

@Module({
  imports: [CacheModule, DatabaseModule],
  providers: [
    RolesGuard,
    PermissionsGuard,
    PermissionCacheService,
    PermissionOverridesRepository,
  ],
  exports: [
    RolesGuard,
    PermissionsGuard,
    PermissionCacheService,
    PermissionOverridesRepository,
  ],
})
export class AuthorizationModule {}
