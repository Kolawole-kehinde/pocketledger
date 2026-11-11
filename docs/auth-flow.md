# Testing the Auth Flow in Swagger

The API exposes a generated OpenAPI contract:

- **Swagger UI:** `http://localhost:<PORT>/docs`
- **OpenAPI JSON:** `http://localhost:<PORT>/docs/openapi.json`
- **OpenAPI YAML:** `http://localhost:<PORT>/docs/openapi.yaml`

Start the API with `pnpm start:dev`, open the Swagger UI, and use the
steps below. The UI is served from the same origin as the API, so the
browser automatically sends the HttpOnly refresh cookie after login.

## Auth schemes

| Swagger scheme   | Type             | Used for |
| ---------------- | ---------------- | -------- |
| `access-token`   | Bearer JWT       | Protected endpoints (`logout`, `logout-all`, `sessions`, profile) |
| `refresh-cookie` | HttpOnly cookie  | `POST /auth/refresh` |

Click **Authorize** and paste the access token into the
`access-token` field. You do not need to paste the refresh cookie; the
login endpoints set it in the browser.

## Registration

1. **`POST /auth/register`**
   - Body: `{ "email": "jane.doe@example.com" }`
   - Response: `200` with a vague confirmation message.
   - Retrieve the six digit OTP from the email delivery channel.

2. **`POST /auth/register/verify`**
   - Body: `{ "email": "jane.doe@example.com", "otp": "123456" }`
   - Response: `200` with `registrationToken` and `expiresInSeconds`.

3. **`POST /auth/register/complete`**
   - Add the header `Authorization: Bearer <registrationToken>`
     (the endpoint shows an `Authorization` parameter in Swagger UI).
   - Body:

     ```json
     {
       "firstName": "Jane",
       "lastName": "Doe",
       "middleName": "A.",
       "username": "jane.doe",
       "phoneNumber": "+2348012345678"
     }
     ```

   - Response: `200` with `accessToken`, `tokenType`, `expiresIn`,
     and the created `user`.
   - The refresh token is set in the `pocketledger_refresh` cookie.

4. Copy the `accessToken`, click **Authorize**, and paste it into the
   `access-token` scheme.

## Login

1. **`POST /auth/login`**
   - Body: `{ "email": "jane.doe@example.com" }`
   - Retrieve the login OTP.

2. **`POST /auth/login/verify`**
   - Body: `{ "email": "jane.doe@example.com", "otp": "123456" }`
   - Response: `200` with a new `accessToken` and the user profile.
   - The refresh cookie is rotated and set again.

3. Copy the new `accessToken` into **Authorize**.

## Session management

1. **`GET /auth/sessions`**
   - Requires `access-token`.
   - Returns active sessions; the `current` flag marks the session
     used for this request.

2. **`DELETE /auth/sessions/{id}`**
   - Requires `access-token`.
   - Revokes one session by id.

3. **`POST /auth/logout`**
   - Revokes the current session and clears the refresh cookie.

4. **`POST /auth/logout-all`**
   - Revokes every session for the user and clears the refresh cookie.

## Token refresh

1. Sign in first so the browser holds the `pocketledger_refresh`
   cookie.
2. **`POST /auth/refresh`**
   - No request body.
   - The browser sends the cookie automatically.
   - Response: a new `accessToken`; the refresh cookie is rotated.

## Error responses

Auth errors use a consistent shape:

```json
{
  "statusCode": 401,
  "code": "INVALID_REFRESH_TOKEN",
  "message": "Invalid or expired session"
}
```

Validation errors include field-level issues:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Validation failed",
  "errors": [
    {
      "field": "otp",
      "message": "OTP must be exactly 6 digits",
      "code": "invalid_format"
    }
  ]
}
```

Rate-limited requests return `429` with `retryAfterSeconds`:

```json
{
  "statusCode": 429,
  "code": "RATE_LIMITED",
  "message": "Too many requests. Please try again later.",
  "retryAfterSeconds": 60
}
```

| Status | Meaning |
| ------ | ------- |
| `400`  | Invalid body, invalid/expired/already-used OTP |
| `401`  | Missing or invalid access token, refresh token, or registration token |
| `403`  | Account unavailable or missing permission |
| `404`  | Session not found |
| `409`  | Username, phone number, or email already in use |
| `429`  | Rate limit exceeded |

## Swagger tips

- Use **Try it out** on each operation, then **Execute**.
- For `POST /auth/register/complete`, fill the endpoint-level
  `Authorization` parameter; do not use the global **Authorize**
  dialog for the registration token.
- After login, use the browser devtools to confirm the
  `pocketledger_refresh` cookie is present.
- If **Try it out** targets the wrong host, check the server URL
  configured in `src/config/swagger.config.ts`.
