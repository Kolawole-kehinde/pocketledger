import type { UserListItem } from '../users.types.js';

export class UserListItemResponseDto {
  id: UserListItem['id'];
  firstName: UserListItem['firstName'];
  lastName: UserListItem['lastName'];
  username: UserListItem['username'];
  email: UserListItem['email'];
  role: UserListItem['role'];
  status: UserListItem['status'];
  createdAt: UserListItem['createdAt'];

  constructor(user: UserListItem) {
    this.id = user.id;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.username = user.username;
    this.email = user.email;
    this.role = user.role;
    this.status = user.status;
    this.createdAt = user.createdAt;
  }
}