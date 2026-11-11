import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DATABASE } from '../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseTransaction,
} from '../../infrastructure/database/database.types.js';
import type {
  NewSecurityEvent,
  SecurityEvent,
} from '../../infrastructure/database/schema/security-events.schema.js';
import { AuthAuditRepository } from '../auth/repositories/auth-audit.repository.js';
import { SecurityEventsRepository } from './security-events.repository.js';
import type {
  PaginatedSecurityEvents,
  SecurityEventListFilters,
} from './security-events.types.js';

export interface SecurityEventRequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SecurityEventsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly securityEventsRepository: SecurityEventsRepository,
    private readonly authAuditRepository: AuthAuditRepository,
  ) {}

  /**
   * Records a security event. Callers that already own a transaction should
   * pass it so the event is committed together with the change it describes.
   */
  async record(
    input: NewSecurityEvent,
    tx?: DatabaseTransaction,
  ): Promise<SecurityEvent> {
    return this.securityEventsRepository.create(input, tx);
  }

  async findById(id: string): Promise<SecurityEvent> {
    const event = await this.securityEventsRepository.findById(id);

    if (!event) {
      throw new NotFoundException('Security event not found');
    }

    return event;
  }

  async list(
    filters: SecurityEventListFilters,
  ): Promise<PaginatedSecurityEvents> {
    const { items, total } =
      await this.securityEventsRepository.findMany(filters);

    return {
      items,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages:
        total === 0 ? 0 : Math.ceil(total / filters.pageSize),
    };
  }

  async resolve(
    id: string,
    actorId: string,
    metadata: SecurityEventRequestMetadata = {},
  ): Promise<SecurityEvent> {
    return this.db.transaction(async (tx) => {
      const existing = await this.securityEventsRepository.findById(
        id,
        tx,
      );

      if (!existing) {
        throw new NotFoundException('Security event not found');
      }

      if (existing.resolvedAt) {
        return existing;
      }

      const resolvedAt = new Date();
      const resolved = await this.securityEventsRepository.resolve(
        id,
        resolvedAt,
        tx,
      );

      if (!resolved) {
        throw new NotFoundException('Security event not found');
      }

      await this.authAuditRepository.recordAuditLog(
        {
          actorUserId: actorId,
          action: 'admin_action',
          entityType: 'security_event',
          entityId: id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          before: { resolvedAt: existing.resolvedAt },
          after: { resolvedAt },
          metadata: {
            eventType: existing.type,
            severity: existing.severity,
          },
        },
        tx,
      );

      return resolved;
    });
  }
}
