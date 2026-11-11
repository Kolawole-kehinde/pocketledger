import type {
  SecurityEvent,
  securityEventSeverityEnum,
  securityEventTypeEnum,
} from '../../infrastructure/database/schema/security-events.schema.js';

export type SecurityEventType =
  (typeof securityEventTypeEnum.enumValues)[number];

export type SecurityEventSeverity =
  (typeof securityEventSeverityEnum.enumValues)[number];

export interface SecurityEventListFilters {
  page: number;
  pageSize: number;
  type?: SecurityEventType;
  severity?: SecurityEventSeverity;
  userId?: string;
  resolved?: boolean;
  from?: Date;
  to?: Date;
}

export interface PaginatedSecurityEvents {
  items: SecurityEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
