import { isIP } from 'node:net';
import type { Request } from 'express';

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
}

function normalizeIp(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const candidate = value.split(',')[0]?.trim();

  if (!candidate) {
    return null;
  }

  return isIP(candidate) ? candidate : null;
}

export function getRequestMetadata(request: Request): RequestMetadata {
  const userAgent = request.get('user-agent')?.slice(0, 1_000) ?? null;
  const deviceNameHeader = request.get('x-device-name');

  return {
    ipAddress: normalizeIp(request.ip ?? request.socket?.remoteAddress),
    userAgent,
    deviceName: deviceNameHeader?.trim().slice(0, 255) || null,
  };
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim() || null;
}

/**
 * Reads the registration token from the Authorization header.
 *
 * Some HTTP clients send a bare token instead of the `Bearer` scheme,
 * so accept both `Bearer <token>` and a raw JWT.
 */
export function extractRegistrationToken(
  authorizationHeader: string | undefined,
): string | null {
  const bearerToken = extractBearerToken(authorizationHeader);

  if (bearerToken) {
    return bearerToken;
  }

  const raw = authorizationHeader?.trim();

  if (raw && raw.split('.').length === 3) {
    return raw;
  }

  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
