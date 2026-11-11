import type { SecurityEvent } from '../../../infrastructure/database/schema/security-events.schema.js';

export class SecurityEventResponseDto {
  id: string;

  userId: string | null;

  type: SecurityEvent['type'];

  severity: SecurityEvent['severity'];

  ipAddress: string | null;

  userAgent: string | null;

  country: string | null;

  city: string | null;

  metadata: Record<string, unknown> | null;

  resolvedAt: Date | null;

  createdAt: Date;

  constructor(event: SecurityEvent) {
    this.id = event.id;
    this.userId = event.userId;
    this.type = event.type;
    this.severity = event.severity;
    this.ipAddress = event.ipAddress;
    this.userAgent = event.userAgent;
    this.country = event.country;
    this.city = event.city;
    this.metadata = event.metadata;
    this.resolvedAt = event.resolvedAt;
    this.createdAt = event.createdAt;
  }
}
