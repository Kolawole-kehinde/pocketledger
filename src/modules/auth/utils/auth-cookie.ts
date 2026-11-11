import type { CookieOptions, Response } from 'express';
import type { ConfigService } from '@nestjs/config';

interface AuthCookieConfig {
  name: string;
  domain?: string;
  sameSite: CookieOptions['sameSite'];
  secure: boolean;
}

export function getAuthCookieConfig(
  configService: ConfigService,
): AuthCookieConfig {
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const configuredSecure = configService.get<boolean>('AUTH_COOKIE_SECURE');
  const sameSite =
    configService.get<'lax' | 'strict' | 'none'>(
      'AUTH_COOKIE_SAME_SITE',
    ) ?? 'lax';

  return {
    name:
      configService.get<string>('AUTH_COOKIE_NAME') ??
      'pocketledger_refresh',
    domain: configService.get<string>('AUTH_COOKIE_DOMAIN'),
    sameSite,
    secure:
      configuredSecure ??
      (nodeEnv === 'production' || sameSite === 'none'),
  };
}

function baseCookieOptions(config: AuthCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: '/auth',
    ...(config.domain ? { domain: config.domain } : {}),
  };
}

export function setRefreshCookie(
  response: Response,
  configService: ConfigService,
  token: string,
  maxAgeSeconds: number,
): void {
  const config = getAuthCookieConfig(configService);

  response.cookie(config.name, token, {
    ...baseCookieOptions(config),
    maxAge: maxAgeSeconds * 1_000,
  });
}

export function clearRefreshCookie(
  response: Response,
  configService: ConfigService,
): void {
  const config = getAuthCookieConfig(configService);

  response.clearCookie(config.name, baseCookieOptions(config));
}

export function readRefreshCookie(
  cookies: Record<string, string | undefined> | undefined,
  configService: ConfigService,
): string | null {
  const config = getAuthCookieConfig(configService);
  const token = cookies?.[config.name];

  return typeof token === 'string' && token.length > 0
    ? token
    : null;
}
