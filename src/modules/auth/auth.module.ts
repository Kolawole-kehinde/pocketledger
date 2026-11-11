import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { RedisModule } from '../../infrastructure/redis/redis.module.js';
import { EmailOutboxModule } from '../../infrastructure/messaging/email-outbox/email-outbox.module.js';
import { OutboxModule } from '../../infrastructure/messaging/outbox/outbox.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { RolesGuard } from '../authorization/guards/roles.guard.js';
import { PermissionsGuard } from '../authorization/guards/permissions.guard.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthAuditModule } from './auth-audit.module.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AccessTokenRevocationsRepository } from './repositories/access-token-revocations.repository.js';
import { OtpChallengesRepository } from './repositories/otp-challenges.repository.js';
import { PendingRegistrationsRepository } from './repositories/pending-registrations.repository.js';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository.js';
import { SessionsRepository } from './repositories/sessions.repository.js';
import { AuthMailerService } from './services/auth-mailer.service.js';
import { AccessTokenRevocationService } from './services/access-token-revocation.service.js';
import { LoginService } from './services/login.service.js';
import { OtpService } from './services/otp.service.js';
import { RateLimiterService } from './services/rate-limiter.service.js';
import { RegistrationService } from './services/registration.service.js';
import { SessionService } from './services/session.service.js';
import { TokenService } from './services/token.service.js';
import { AuthCleanupWorker } from './workers/auth-cleanup.worker.js';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    UsersModule,
    AuthorizationModule,
    AuthAuditModule,
    EmailOutboxModule,
    OutboxModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    TokenService,
    OtpService,
    RateLimiterService,
    AuthMailerService,
    SessionService,
    AccessTokenRevocationService,
    RegistrationService,
    LoginService,
    PendingRegistrationsRepository,
    OtpChallengesRepository,
    SessionsRepository,
    RefreshTokensRepository,
    AccessTokenRevocationsRepository,
    AuthCleanupWorker,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useExisting: PermissionsGuard,
    },
  ],
  exports: [
    TokenService,
    SessionService,
    AccessTokenRevocationService,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
