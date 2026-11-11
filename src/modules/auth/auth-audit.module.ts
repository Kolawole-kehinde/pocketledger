import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuthAuditRepository } from './repositories/auth-audit.repository.js';

/**
 * Shared audit module so auth flows and user administration can both record
 * security events without creating a circular dependency between the auth and
 * users modules.
 */
@Module({
  imports: [DatabaseModule],
  providers: [AuthAuditRepository],
  exports: [AuthAuditRepository],
})
export class AuthAuditModule {}
