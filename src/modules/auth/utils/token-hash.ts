import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OtpChallenge } from '../../../infrastructure/database/schema/otp-challenges.schema.js';

export function hmacSha256(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

export function hashOtp(
  email: string,
  purpose: OtpChallenge['purpose'],
  otp: string,
  secret: string,
): string {
  return hmacSha256(`${purpose}:${email}:${otp}`, secret);
}

export function hashRefreshToken(
  token: string,
  secret: string,
): string {
  return hmacSha256(token, secret);
}

export function constantTimeEqualHex(
  expected: string,
  actual: string,
): boolean {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
