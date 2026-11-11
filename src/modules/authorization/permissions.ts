import type { User } from '../../infrastructure/database/schema/users.schema.js';

export const PERMISSIONS = {
  PROFILE_READ: 'profile:read',
  PROFILE_UPDATE: 'profile:update',
  USERS_READ: 'users:read',
  USERS_ROLE_UPDATE: 'users:role:update',
  USERS_STATUS_UPDATE: 'users:status:update',
  SESSIONS_READ: 'sessions:read',
  SESSIONS_REVOKE: 'sessions:revoke',
  SECURITY_EVENTS_READ: 'security-events:read',
  SECURITY_EVENTS_RESOLVE: 'security-events:resolve',
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const SELF_SERVICE_PERMISSIONS: Permission[] = [
  PERMISSIONS.PROFILE_READ,
  PERMISSIONS.PROFILE_UPDATE,
  PERMISSIONS.SESSIONS_READ,
  PERMISSIONS.SESSIONS_REVOKE,
];

export const ROLE_PERMISSIONS: Record<
  User['role'],
  ReadonlySet<Permission>
> = {
  customer: new Set(SELF_SERVICE_PERMISSIONS),
  support: new Set([
    ...SELF_SERVICE_PERMISSIONS,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.SECURITY_EVENTS_READ,
  ]),
  admin: new Set(Object.values(PERMISSIONS)),
};

export function hasPermission(
  role: User['role'],
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
