import type { User } from '../../../infrastructure/database/schema/users.schema.js';
import type { Role } from '../../authorization/roles.js';

export class UserResponseDto {
  id: User['id'];
  firstName: User['firstName'];
  lastName: User['lastName'];
  middleName: User['middleName'];
  username: User['username'];
  email: User['email'];
  phoneNumber: User['phoneNumber'];
  role: Role;
  roles: Role[];
  status: User['status'];
  createdAt: User['createdAt'];
  updatedAt: User['updatedAt'];

  constructor(user: User & { roles?: Role[] }) {
    const roles = user.roles && user.roles.length > 0 ? user.roles : (['customer'] as Role[]);
    this.id = user.id;
    this.firstName = user.firstName;
    this.lastName = user.lastName;
    this.middleName = user.middleName;
    this.username = user.username;
    this.email = user.email;
    this.phoneNumber = (user as any).phoneNumber ?? null;
    this.role = roles[0];
    this.roles = roles;
    this.status = user.status;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }
}