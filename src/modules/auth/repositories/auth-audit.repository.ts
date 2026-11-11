import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../../infrastructure/database/database.types.js';
import {
  auditLogs,
  type NewAuditLog,
} from '../../../infrastructure/database/schema/audit-logs.schema.js';
import {
  loginAttempts,
  type NewLoginAttempt,
} from '../../../infrastructure/database/schema/login-attempts.schema.js';
import {
  securityEvents,
  type NewSecurityEvent,
} from '../../../infrastructure/database/schema/security-events.schema.js';

@Injectable()
export class AuthAuditRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async recordSecurityEvent(
    input: NewSecurityEvent,
    tx?: DatabaseTransaction,
  ): Promise<void> {
    await this.executor(tx).insert(securityEvents).values(input);
  }

  async recordLoginAttempt(
    input: NewLoginAttempt,
    tx?: DatabaseTransaction,
  ): Promise<void> {
    await this.executor(tx).insert(loginAttempts).values(input);
  }

  async recordAuditLog(
    input: NewAuditLog,
    tx?: DatabaseTransaction,
  ): Promise<void> {
    await this.executor(tx).insert(auditLogs).values(input);
  }
}
