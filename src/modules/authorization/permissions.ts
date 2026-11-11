import type { User } from '../../infrastructure/database/schema/users.schema.js';
import {
  DEFAULT_ROLE,
  ROLES,
  ROLE_DEFINITIONS,
  ROLE_VALUES,
  type Role,
} from './roles.js';

/**
 * Permission catalog.
 *
 * Permissions are the unit of authorization. Routes declare the permission
 * they need and the role -> permission matrix below decides who has it by
 * default. Per-user overrides (grant/revoke) are applied on top of the role
 * defaults at request time.
 */
export const PERMISSIONS = {
  PROFILE_READ: 'profile:read',
  PROFILE_UPDATE: 'profile:update',

  USERS_READ: 'users:read',
  USERS_UPDATE: 'users:update',
  USERS_ROLE_UPDATE: 'users:role:update',
  USERS_STATUS_UPDATE: 'users:status:update',
  USERS_PERMISSIONS_READ: 'users:permissions:read',
  USERS_PERMISSIONS_MANAGE: 'users:permissions:manage',

  SESSIONS_READ: 'sessions:read',
  SESSIONS_REVOKE: 'sessions:revoke',

  SECURITY_EVENTS_READ: 'security-events:read',
  SECURITY_EVENTS_RESOLVE: 'security-events:resolve',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as [
  Permission,
  ...Permission[],
];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Permissions every authenticated user has over their own account.
 */
const SELF_SERVICE_PERMISSIONS: Permission[] = [
  PERMISSIONS.PROFILE_READ,
  PERMISSIONS.PROFILE_UPDATE,
  PERMISSIONS.SESSIONS_READ,
  PERMISSIONS.SESSIONS_REVOKE,
];

const SUPPORT_PERMISSIONS: Permission[] = [
  ...SELF_SERVICE_PERMISSIONS,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.USERS_PERMISSIONS_READ,
  PERMISSIONS.SECURITY_EVENTS_READ,
];

/**
 * Default permission matrix for each role.
 *
 * Admins receive the whole catalog. Support is intentionally read-only:
 * support agents can find a customer and inspect the security trail, but they
 * cannot change roles, statuses, permissions or account data.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [ROLES.CUSTOMER]: new Set(SELF_SERVICE_PERMISSIONS),
  [ROLES.SUPPORT]: new Set(SUPPORT_PERMISSIONS),
  [ROLES.ADMIN]: new Set(ALL_PERMISSIONS),
};

export function hasPermission(
  role: User['role'],
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export interface RoleCatalogEntry {
  role: Role;
  label: string;
  description: string;
  level: number;
  isDefault: boolean;
  permissions: Permission[];
}

/**
 * Describes every role and the permissions it grants by default. This is the
 * payload returned by the role catalog endpoint and keeps documentation,
 * tooling and the runtime matrix in sync.
 */
export function getRoleCatalog(): RoleCatalogEntry[] {
  return ROLE_VALUES.map((role) => ({
    ...ROLE_DEFINITIONS[role],
    permissions: [...ROLE_PERMISSIONS[role]].sort(),
  }));
}

export { DEFAULT_ROLE, ROLES, ROLE_DEFINITIONS, ROLE_VALUES };
export type { Role };
