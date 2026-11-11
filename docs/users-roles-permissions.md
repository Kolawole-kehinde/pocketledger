# Users, Roles and Permissions API

Administrative account management for PocketLedger.

- **Base path:** `/users`
- **Authentication:** Bearer access token (`Authorization: Bearer <access-token>`)
- **Authorization:** permission-based. Every route declares the permission it
  requires; roles provide the default permission set and administrators may
  grant or revoke individual permissions per user.

## Roles

Roles are defined in `src/modules/authorization/roles.ts`. Every account has
exactly one role, and the role is stored in the `users.role` column.

| Role       | Label         | Default for new accounts | Summary |
| ---------- | ------------- | ------------------------ | ------- |
| `customer` | Customer      | Yes                      | Owns an account and manages their own profile and sessions. |
| `support`  | Support       | No                       | Read-only access to customer accounts and security events for troubleshooting. |
| `admin`    | Administrator | No                       | Full platform administration, including users, roles, permissions and security events. |

Removing an elevated role downgrades the user to `customer`. A user can never
be left without a role, and the last remaining administrator cannot be
demoted or removed.

## Default permission matrix

The catalog and matrix live in `src/modules/authorization/permissions.ts`.

| Permission                  | Customer | Support | Admin |
| --------------------------- | :------: | :-----: | :---: |
| `profile:read`              |    ✓     |    ✓    |   ✓   |
| `profile:update`            |    ✓     |    ✓    |   ✓   |
| `sessions:read`             |    ✓     |    ✓    |   ✓   |
| `sessions:revoke`           |    ✓     |    ✓    |   ✓   |
| `users:read`                |    —     |    ✓    |   ✓   |
| `users:permissions:read`    |    —     |    ✓    |   ✓   |
| `security-events:read`      |    —     |    ✓    |   ✓   |
| `users:update`              |    —     |    —    |   ✓   |
| `users:role:update`         |    —     |    —    |   ✓   |
| `users:status:update`       |    —     |    —    |   ✓   |
| `users:permissions:manage`  |    —     |    —    |   ✓   |
| `security-events:resolve`   |    —     |    —    |   ✓   |

Support access is intentionally read-only. Only administrators can change
account data, roles, statuses or permissions.

### Per-user overrides

Administrators can grant or revoke individual permissions for a user. The
effective permission set is:

```
role permissions
  + granted overrides
  - revoked overrides
```

Overrides are stored in `user_permission_overrides` and are cached with the
effective permission set. Changing a user's role clears all of that user's
overrides so the account returns to the new role's baseline.

Administrators cannot change their **own** role, status or permissions, which
prevents accidental self-lockout.

## Endpoints

### `GET /users/me`

Returns the authenticated user's profile. Requires `profile:read`.

### `PATCH /users/me`

Updates the authenticated user's profile. Accepts any subset of `firstName`,
`lastName`, `middleName`, `username` and `phoneNumber`. Requires
`profile:update`.

### `GET /users/roles`

Returns the role catalog with each role's label, description, privilege level
and default permissions. Requires `users:read`.

### `GET /users`

Paginated user list. Requires `users:read`.

Query parameters: `page`, `pageSize`, `search`, `role`, `status`, `sortBy`,
`sortOrder`, `createdFrom`, `createdTo`.

### `GET /users/{id}`

Returns a single user. Requires `users:read`.

### `PATCH /users/{id}`

Updates another user's profile fields. Requires `users:update` (admin).

### `POST /users/{id}/roles`

Assigns a role to a user. Requires `users:role:update` (admin).

```json
{ "role": "support" }
```

### `PATCH /users/{id}/role`

Replaces a user's role. Requires `users:role:update` (admin).

```json
{ "role": "admin" }
```

### `DELETE /users/{id}/role`

Removes an elevated role, downgrading the user to `customer`. Requires
`users:role:update` (admin). Returns `400 ROLE_ALREADY_REMOVED` when the user is
already a customer and `400 LAST_ADMIN` when demoting the last administrator.

### `PATCH /users/{id}/status`

Changes account status. Requires `users:status:update` (admin).

```json
{ "status": "suspended" }
```

Accepted values: `pending_verification`, `active`, `inactive`, `suspended`,
`closed`.

### `GET /users/{id}/permissions`

Returns the user's role, effective permission set and explicit overrides.
Requires `users:permissions:read` (support or admin).

```json
{
  "userId": "5b0f2b7c-1f4e-4f8a-9d2c-7e6a1b3c4d5e",
  "role": "support",
  "permissions": ["profile:read", "users:read", "..."],
  "overrides": [
    {
      "id": "0f1b5f4e-6f0a-4b7c-9a4e-2b1c3d4e5f60",
      "permission": "security-events:read",
      "effect": "revoke",
      "actorUserId": "d2c9e7a1-3b4f-4c5d-8e9f-0a1b2c3d4e5f",
      "reason": "Temporary support rotation",
      "createdAt": "2026-11-11T10:15:30.000Z",
      "updatedAt": "2026-11-11T10:15:30.000Z"
    }
  ]
}
```

### `POST /users/{id}/permissions/grant`

Grants a permission the user's role does not provide. Requires
`users:permissions:manage` (admin).

```json
{ "permission": "security-events:resolve", "reason": "On-call incident lead" }
```

Returns `400 PERMISSION_ALREADY_HELD` when the role already provides it.

### `POST /users/{id}/permissions/revoke`

Revokes a permission the user currently holds. Requires
`users:permissions:manage` (admin). Returns the updated permission state.

```json
{ "permission": "users:permissions:read", "reason": "Offboarding" }
```

Returns `400 PERMISSION_NOT_HELD` when the user does not currently have it.

### `DELETE /users/{id}/permissions/{permission}`

Removes an explicit grant or revoke override, restoring the role baseline.
Permission values contain colons and must be URL-encoded by clients, for
example:

```http
DELETE /users/{id}/permissions/users%3Arole%3Aupdate
```

Returns `404` when no override exists.

## Error codes

| Code                             | Meaning |
| -------------------------------- | ------- |
| `CANNOT_CHANGE_OWN_ROLE`         | An administrator tried to change their own role. |
| `CANNOT_CHANGE_OWN_STATUS`       | An administrator tried to change their own status. |
| `CANNOT_CHANGE_OWN_PERMISSIONS`  | An administrator tried to change their own permissions. |
| `ROLE_ALREADY_REMOVED`           | The user already has the default `customer` role. |
| `LAST_ADMIN`                     | The operation would demote the last administrator. |
| `PERMISSION_ALREADY_HELD`        | The user already has the permission through their role or a grant. |
| `PERMISSION_NOT_HELD`            | The user does not have the permission to revoke. |
| `INVALID_PERMISSION`             | The permission is not in the catalog. |
| `USER_FIELD_TAKEN`               | A profile field (username or phone number) is already in use. |

## Audit trail

- Role changes write a `role_changed` security event.
- Status changes write `account_suspended` or `account_reactivated` security
  events.
- Permission grant/revoke/clear operations write an `admin_action` audit log
  with the acting administrator, target user, change and reason.
