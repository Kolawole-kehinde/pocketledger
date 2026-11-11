import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { SecurityEvent } from '../../../infrastructure/database/schema/security-events.schema.js';
import {
  securityEventSeverityEnum,
  securityEventTypeEnum,
} from '../../../infrastructure/database/schema/security-events.schema.js';

export class SecurityEventResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f1cb2f7-6f0e-4a8e-9a4a-2f2b2f4b1c11',
  })
  id: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'User the event belongs to. Null for anonymous events.',
  })
  userId: string | null;

  @ApiProperty({
    enum: securityEventTypeEnum.enumValues,
    example: 'login_failed',
  })
  type: SecurityEvent['type'];

  @ApiProperty({
    enum: securityEventSeverityEnum.enumValues,
    example: 'medium',
  })
  severity: SecurityEvent['severity'];

  @ApiPropertyOptional({
    nullable: true,
    example: '203.0.113.10',
  })
  ipAddress: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  })
  userAgent: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Nigeria' })
  country: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Lagos' })
  city: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Event-specific context.',
    example: { reason: 'invalid_otp', attempts: 3 },
  })
  metadata: Record<string, unknown> | null;

  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'When the event was resolved. Null while unresolved.',
  })
  resolvedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
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
