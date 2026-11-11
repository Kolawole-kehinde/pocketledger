import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
} from 'drizzle-orm';

import { DATABASE } from '../../infrastructure/database/database.provider.js';
import type {
  Database,
  DatabaseExecutor,
  DatabaseTransaction,
} from '../../infrastructure/database/database.types.js';
import {
  securityEvents,
  type NewSecurityEvent,
  type SecurityEvent,
} from '../../infrastructure/database/schema/security-events.schema.js';
import type { SecurityEventListFilters } from './security-events.types.js';

@Injectable()
export class SecurityEventsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private executor(tx?: DatabaseTransaction): DatabaseExecutor {
    return tx ?? this.db;
  }

  async create(
    data: NewSecurityEvent,
    tx?: DatabaseTransaction,
  ): Promise<SecurityEvent> {
    const [event] = await this.executor(tx)
      .insert(securityEvents)
      .values(data)
      .returning();

    return event;
  }

  async findById(
    id: string,
    tx?: DatabaseTransaction,
  ): Promise<SecurityEvent | null> {
    const [event] = await this.executor(tx)
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.id, id))
      .limit(1);

    return event ?? null;
  }

  async findMany(
    filters: SecurityEventListFilters,
  ): Promise<{ items: SecurityEvent[]; total: number }> {
    const typeCondition = filters.type
      ? eq(securityEvents.type, filters.type)
      : undefined;
    const severityCondition = filters.severity
      ? eq(securityEvents.severity, filters.severity)
      : undefined;
    const userCondition = filters.userId
      ? eq(securityEvents.userId, filters.userId)
      : undefined;
    const resolvedCondition =
      filters.resolved === undefined
        ? undefined
        : filters.resolved
          ? isNotNull(securityEvents.resolvedAt)
          : isNull(securityEvents.resolvedAt);
    const fromCondition = filters.from
      ? gte(securityEvents.createdAt, filters.from)
      : undefined;
    const toCondition = filters.to
      ? lte(securityEvents.createdAt, filters.to)
      : undefined;

    const where = and(
      typeCondition,
      severityCondition,
      userCondition,
      resolvedCondition,
      fromCondition,
      toCondition,
    );
    const offset = (filters.page - 1) * filters.pageSize;

    const [items, totalRows] = await Promise.all([
      this.db
        .select()
        .from(securityEvents)
        .where(where)
        .orderBy(desc(securityEvents.createdAt))
        .limit(filters.pageSize)
        .offset(offset),
      this.db
        .select({ value: count() })
        .from(securityEvents)
        .where(where),
    ]);

    return {
      items,
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  async resolve(
    id: string,
    resolvedAt: Date,
    tx?: DatabaseTransaction,
  ): Promise<SecurityEvent | null> {
    const [event] = await this.executor(tx)
      .update(securityEvents)
      .set({ resolvedAt })
      .where(eq(securityEvents.id, id))
      .returning();

    return event ?? null;
  }
}
