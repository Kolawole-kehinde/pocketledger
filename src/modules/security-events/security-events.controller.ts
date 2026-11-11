import { Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../authorization/decorators/current-user.decorator.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { getRequestMetadata } from '../auth/utils/request-metadata.js';
import { PaginatedSecurityEventsResponseDto } from './dto/paginated-security-events-response.dto.js';
import { SecurityEventResponseDto } from './dto/security-event-response.dto.js';
import {
  securityEventIdParamSchema,
  securityEventListQuerySchema,
  type SecurityEventListQuery,
} from './schemas/security-event-query-schema.js';
import { SecurityEventsService } from './security-events.service.js';

@Controller('security-events')
export class SecurityEventsController {
  constructor(private readonly securityEventsService: SecurityEventsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SECURITY_EVENTS_READ)
  async list(
    @Query(new ZodValidationPipe(securityEventListQuerySchema))
    query: SecurityEventListQuery,
  ): Promise<PaginatedSecurityEventsResponseDto> {
    const result = await this.securityEventsService.list(query);

    return new PaginatedSecurityEventsResponseDto(result);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SECURITY_EVENTS_READ)
  async get(
    @Param('id', new ZodValidationPipe(securityEventIdParamSchema))
    id: string,
  ): Promise<SecurityEventResponseDto> {
    const event = await this.securityEventsService.findById(id);

    return new SecurityEventResponseDto(event);
  }

  @Patch(':id/resolve')
  @RequirePermissions(PERMISSIONS.SECURITY_EVENTS_RESOLVE)
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
