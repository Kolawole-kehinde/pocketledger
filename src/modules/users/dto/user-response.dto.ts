import type { User } from '../../../infrastructure/database/schema/users.schema.js';

export class UserResponseDto {
  id: User['id'];
  firstName: User['firstName'];
  lastName: User['lastName'];
  middleName: User['middleName'];
  username: User['username'];
  email: User['email'];
  phoneNumber: User['phoneNumber'];
  role: User['role'];
  status: User['status'];
  createdAt: User['createdAt'];
  updatedAt: User['updatedAt'];

  constructor(user: User) {
    this.id = user.id;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.middleName = user.middleName;
    this.username = user.username;
    this.email = user.email;
    this.phoneNumber = user.phoneNumber;
    this.role = user.role;
    this.status = user.status;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}