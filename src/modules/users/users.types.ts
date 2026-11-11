
import type {
  NewUser,
  User,
} from '../../infrastructure/database/schema/users.schema.js';

import type { UserPermissionOverride } from '../../infrastructure/database/schema/permission-overrides.schema.js';
import type { DatabaseTransaction } from '../../infrastructure/database/database.types.js';
import type { Permission } from '../authorization/permissions.js';
import type { UpdateUserInput } from './schemas/update-user-schema.js';

export type UserTransaction = DatabaseTransaction;

export type UpdateUserData = UpdateUserInput;

export type CreateUserData = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  username: string;
  email: string;
  phoneNumber: string;
};

export type CreateVerifiedCustomerData = Pick<
  NewUser,
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'username'
  | 'email'
  | 'phoneNumber'
>;

export interface UserListFilters {
  page: number;
  pageSize: number;
  search?: string;
  role?: User['role'];
  status?: User['status'];
  sortBy: 'createdAt' | 'firstName' | 'lastName' | 'email';
  sortOrder: 'asc' | 'desc';
  createdFrom?: string;
  createdTo?: string;
}

export interface FindUsersOptions extends UserListFilters {
  offset: number;
}

export interface UserListItem {
  id: User['id'];
  firstName: User['firstName'];
  lastName: User['lastName'];
  username: User['username'];
  email: User['email'];
  role: User['role'];
  status: User['status'];
  createdAt: User['createdAt'];
}

export interface UserListResult {
  data: UserListItem[];
  total: number;
}

export interface PaginatedUsers {
  data: UserListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/** Request metadata attached to administrative audit records. */
export interface AdminActionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UserPermissionState {
  user: User;
  /** Effective permissions after role defaults and overrides. */
  permissions: Permission[];
  overrides: UserPermissionOverride[];
}
