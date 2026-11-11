import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AuthAuditModule } from '../auth/auth-audit.module.js';
import { SecurityEventsController } from './security-events.controller.js';
import { SecurityEventsRepository } from './security-events.repository.js';
import { SecurityEventsService } from './security-events.service.js';

@Module({
  imports: [DatabaseModule, AuthorizationModule, AuthAuditModule],
  controllers: [SecurityEventsController],
  providers: [SecurityEventsRepository, SecurityEventsService],
  exports: [SecurityEventsService],
})
export class SecurityEventsModule {}
