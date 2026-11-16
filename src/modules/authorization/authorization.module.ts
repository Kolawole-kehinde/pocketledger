import { Module } from '@nestjs/common';

import { CacheModule } from '../../infrastructure/cache/cache.module.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PermissionOverridesRepository } from './repositories/permission-overrides.repository.js';
import { UserRolesRepository } from './repositories/user-roles.repository.js';
import { PermissionCacheService } from './services/permission-cache.service.js';

@Module({
  imports: [CacheModule, DatabaseModule],
  providers: [
    RolesGuard,
    PermissionsGuard,
    PermissionCacheService,
    PermissionOverridesRepository,
    UserRolesRepository,
  ],
  exports: [
    RolesGuard,
    PermissionsGuard,
    PermissionCacheService,
    PermissionOverridesRepository,
    UserRolesRepository,
  ],
})
export class AuthorizationModule {}
