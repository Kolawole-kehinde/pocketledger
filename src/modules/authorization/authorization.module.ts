import { Module } from '@nestjs/common';
import { CacheModule } from '../../infrastructure/cache/cache.module.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { PermissionCacheService } from './services/permission-cache.service.js';

@Module({
  imports: [CacheModule],
  providers: [RolesGuard, PermissionsGuard, PermissionCacheService],
  exports: [RolesGuard, PermissionsGuard, PermissionCacheService],
})
export class AuthorizationModule {}
