import { ApiProperty } from '@nestjs/swagger';

import type { PaginatedSecurityEvents } from '../security-events.types.js';
import { SecurityEventResponseDto } from './security-event-response.dto.js';

export class PaginatedSecurityEventsResponseDto {
  @ApiProperty({ type: () => [SecurityEventResponseDto] })
  items: SecurityEventResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  constructor(result: PaginatedSecurityEvents) {
    this.items = result.items.map(
      (event) => new SecurityEventResponseDto(event),
    );
    this.total = result.total;
    this.page = result.page;
    this.pageSize = result.pageSize;
    this.totalPages = result.totalPages;
  }
}
