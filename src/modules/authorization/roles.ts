import type { User } from '../../infrastructure/database/schema/users.schema.js';

/**
 * Canonical role names used throughout the application.
 *
 * The database enum is the source of truth for persisted values; this object
 * gives the rest of the codebase a typed, discoverable reference so role
 * strings are never scattered as magic values.
 */
export const ROLES = {
  CUSTOMER: 'customer',
  SUPPORT: 'support',
  ADMIN: 'admin',
} as const satisfies Record<string, User['role']>;

export type Role = User['role'];

/** Every user starts with this role when their account is created. */
export const DEFAULT_ROLE: Role = ROLES.CUSTOMER;

export interface RoleDefinition {
  /** Stable value stored in the database. */
  role: Role;
  /** Human-readable name for API responses, admin tooling and docs. */
  label: string;
  /** What a user with this role is expected to do. */
  description: string;
  /**
   * Relative privilege level. Used to reason about role hierarchy in admin
   * tooling; authorization itself is always permission-based.
   */
  level: number;
  /** True for the role assigned to newly registered accounts. */
  isDefault: boolean;
}

/**
 * The three roles supported by PocketLedger.
 *
 * - `customer` owns their own account and can only act on their own data.
 * - `support` can inspect customer accounts and security events to help
 *   investigate issues, but cannot mutate accounts or authorization.
 * - `admin` administers the platform, including users, roles, permissions and
 *   the security audit trail.
 */
export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  [ROLES.CUSTOMER]: {
    role: ROLES.CUSTOMER,
    label: 'Customer',
    description:
      'Owns a PocketLedger account and manages their own profile and sessions.',
    level: 10,
    isDefault: true,
  },
  [ROLES.SUPPORT]: {
    role: ROLES.SUPPORT,
    label: 'Support',
    description:
      'Read-only access to customer accounts and security events for troubleshooting.',
    level: 20,
    isDefault: false,
  },
  [ROLES.ADMIN]: {
    role: ROLES.ADMIN,
    label: 'Administrator',
    description:
      'Full platform administration, including users, roles, permissions and security events.',
    level: 30,
    isDefault: false,
  },
};

export const ROLE_VALUES = [
  ROLES.CUSTOMER,
  ROLES.SUPPORT,
  ROLES.ADMIN,
] as [Role, ...Role[]];

export function isRole(value: string): value is Role {
  return (ROLE_VALUES as readonly string[]).includes(value);
}
