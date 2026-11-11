# Security Events API

Administrative audit trail for authentication, session, account and
suspicious-activity events. Every event is written to the
`security_events` table by the auth and user-administration flows.

- **Base path:** `/security-events`
- **Authentication:** Bearer access token (`Authorization: Bearer <token>`)
- **Swagger UI:** `/docs` (configurable via `SWAGGER_PATH`)
- **OpenAPI JSON:** `/docs/openapi.json`
- **OpenAPI YAML:** `/docs/openapi.yaml`

Documentation is enabled by default outside production and can be
controlled with `SWAGGER_ENABLED`.

## Permissions

| Permission                 | Roles            |
| -------------------------- | ---------------- |
| `security-events:read`     | `support`, `admin` |
| `security-events:resolve`  | `admin`          |

## Endpoints

### `GET /security-events`

Returns a paginated, newest-first list of security events.

Query parameters:

| Name        | Type                                                        | Default | Description |
| ----------- | ----------------------------------------------------------- | ------- | ----------- |
| `page`      | integer ≥ 1                                                 | `1`     | Page number |
| `pageSize`  | integer 1–100                                               | `20`    | Items per page |
| `userId`    | UUID                                                        | —       | Filter by associated user |
| `type`      | `SecurityEventType`                                         | —       | Filter by event type |
| `severity`  | `low` \| `medium` \| `high` \| `critical`                    | —       | Filter by severity |
| `resolved`  | `true` \| `false`                                           | —       | Filter by resolution state |
| `from`      | ISO 8601 date-time                                          | —       | Inclusive `createdAt` lower bound |
| `to`        | ISO 8601 date-time                                          | —       | Inclusive `createdAt` upper bound |

`from` must be earlier than or equal to `to`.

Example:

```http
GET /security-events?severity=high&resolved=false&page=1&pageSize=20
Authorization: Bearer <access-token>
```

Response (`200`):

```json
{
  "items": [
    {
      "id": "0f1b5f4e-6f0a-4b7c-9a4e-2b1c3d4e5f60",
      "userId": "5b0f2b7c-1f4e-4f8a-9d2c-7e6a1b3c4d5e",
      "type": "login_failed",
      "severity": "high",
      "ipAddress": "203.0.113.10",
      "userAgent": "Mozilla/5.0 ...",
      "country": "NG",
      "city": "Lagos",
      "metadata": { "reason": "invalid_otp", "attempt": 3 },
      "resolvedAt": null,
      "createdAt": "2026-11-09T10:15:30.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

### `GET /security-events/{id}`

Returns a single security event.

- `200` — event found
- `404` — event not found

### `PATCH /security-events/{id}/resolve`

Marks an event as resolved by setting `resolvedAt`. Resolving an
already-resolved event is idempotent and returns the existing record.
Each resolution is also written to the audit log with the acting
administrator and request metadata.

- `200` — event resolved
- `404` — event not found

## Security event types

`otp_requested`, `otp_verified`, `otp_verification_failed`,
`registration_completed`, `login_succeeded`, `login_failed`,
`session_created`, `session_revoked`, `access_token_revoked`,
`refresh_token_rotated`, `refresh_token_reuse_detected`,
`rate_limit_exceeded`, `account_suspended`, `account_reactivated`,
`role_changed`, `suspicious_activity_detected`

## Severities

`low`, `medium`, `high`, `critical`

## Error format

Errors follow the NestJS HTTP exception shape:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "errors": [
    {
      "field": "severity",
      "message": "Invalid option",
      "code": "invalid_value"
    }
  ]
}
```
