import type { UserPermissionState } from '../users.types.js';

export class PermissionOverrideResponseDto {
  id: string;
  permission: string;
  effect: 'grant' | 'revoke';
  actorUserId: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(override: UserPermissionState['overrides'][number]) {
    this.id = override.id;
    this.permission = override.permission;
    this.effect = override.effect;
    this.actorUserId = override.actorUserId;
    this.reason = override.reason;
    this.createdAt = override.createdAt;
    this.updatedAt = override.updatedAt;
  }
}

export class UserPermissionStateResponseDto {
  userId: string;
  role: UserPermissionState['user']['role'];
  permissions: string[];
  overrides: PermissionOverrideResponseDto[];

  constructor(state: UserPermissionState) {
    this.userId = state.user.id;
    this.role = state.user.role;
    this.permissions = state.permissions;
    this.overrides = state.overrides.map(
      (override) => new PermissionOverrideResponseDto(override),
    );
  }
}
