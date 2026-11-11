import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../authorization/decorators/current-user.decorator.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { getRequestMetadata } from '../auth/utils/request-metadata.js';
import {
  securityEventSeverityEnum,
  securityEventTypeEnum,
} from '../../infrastructure/database/schema/security-events.schema.js';
import { PaginatedSecurityEventsResponseDto } from './dto/paginated-security-events-response.dto.js';
import { SecurityEventResponseDto } from './dto/security-event-response.dto.js';
import {
  securityEventIdParamSchema,
  securityEventListQuerySchema,
  type SecurityEventListQuery,
} from './schemas/security-event-query-schema.js';
import { SecurityEventsService } from './security-events.service.js';

@ApiTags('Security Events')
@ApiBearerAuth('access-token')
@Controller('security-events')
export class SecurityEventsController {
  constructor(
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SECURITY_EVENTS_READ)
  @ApiOperation({
    summary: 'List security events',
    description:
      'Returns security events ordered by creation date, newest first. ' +
      'Supports filtering by event type, severity, user, resolution state ' +
      'and creation time window.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
    },
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: securityEventTypeEnum.enumValues,
  })
  @ApiQuery({
    name: 'severity',
    required: false,
    enum: securityEventSeverityEnum.enumValues,
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'resolved',
    required: false,
    schema: { type: 'boolean' },
    description:
      'When provided, only returns resolved (true) or unresolved (false) events.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    schema: { type: 'string', format: 'date-time' },
    description: 'Only events created at or after this timestamp.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    schema: { type: 'string', format: 'date-time' },
    description: 'Only events created at or before this timestamp.',
  })
  @ApiOkResponse({
    type: PaginatedSecurityEventsResponseDto,
    description: 'Paginated list of security events.',
  })
  async list(
    @Query(new ZodValidationPipe(securityEventListQuerySchema))
    query: SecurityEventListQuery,
  ): Promise<PaginatedSecurityEventsResponseDto> {
    const result = await this.securityEventsService.list(query);

    return new PaginatedSecurityEventsResponseDto(result);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SECURITY_EVENTS_READ)
  @ApiOperation({ summary: 'Get a security event by id' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Security event id.',
  })
  @ApiOkResponse({ type: SecurityEventResponseDto })
  @ApiNotFoundResponse({ description: 'Security event not found.' })
  async get(
    @Param('id', new ZodValidationPipe(securityEventIdParamSchema))
    id: string,
  ): Promise<SecurityEventResponseDto> {
    const event = await this.securityEventsService.findById(id);

    return new SecurityEventResponseDto(event);
  }

  @Patch(':id/resolve')
  @RequirePermissions(PERMISSIONS.SECURITY_EVENTS_RESOLVE)
  @ApiOperation({
    summary: 'Resolve a security event',
    description:
      'Marks an unresolved security event as resolved. Resolving an already ' +
      'resolved event is idempotent and returns the existing record. Every ' +
      'state change is written to the audit log.',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Security event id.',
  })
  @ApiOkResponse({ type: SecurityEventResponseDto })
  @ApiNotFoundResponse({ description: 'Security event not found.' })
  async resolve(
    @CurrentUser('sub') actorId: string,
    @Param('id', new ZodValidationPipe(securityEventIdParamSchema))
    id: string,
    @Req() request: Request,
  ): Promise<SecurityEventResponseDto> {
    const event = await this.securityEventsService.resolve(
      id,
      actorId,
      getRequestMetadata(request),
    );

    return new SecurityEventResponseDto(event);
  }
}
