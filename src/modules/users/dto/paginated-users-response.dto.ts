import type { PaginatedUsers } from '../users.types.js';
import { UserListItemResponseDto } from './user-list-item-response.dto.js';


export class PaginatedUsersResponseDto {
  data: UserListItemResponseDto[];

  meta: PaginatedUsers['meta'];

  constructor(result: PaginatedUsers) {
    this.data = result.data.map(
      (user) => new UserListItemResponseDto(user),
    );

    this.meta = result.meta;
  }
}