import type { PaginatedSecurityEvents } from '../security-events.types.js';
import { SecurityEventResponseDto } from './security-event-response.dto.js';

export class PaginatedSecurityEventsResponseDto {
  items: SecurityEventResponseDto[];

  total: number;

  page: number;

  pageSize: number;

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
