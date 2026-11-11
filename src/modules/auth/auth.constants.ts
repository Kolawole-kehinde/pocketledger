export const TOKEN_TYPE_ACCESS = 'access';
export const TOKEN_TYPE_REGISTRATION = 'registration_completion';

export const AUTH_RATE_LIMITS = {
  registerIp: { limit: 5, windowSeconds: 15 * 60 },
  registerEmail: { limit: 3, windowSeconds: 15 * 60 },
  loginIp: { limit: 10, windowSeconds: 15 * 60 },
  loginEmail: { limit: 5, windowSeconds: 15 * 60 },
  otpVerifyIp: { limit: 10, windowSeconds: 10 * 60 },
  otpVerifyEmail: { limit: 10, windowSeconds: 10 * 60 },
  completeRegistrationIp: { limit: 10, windowSeconds: 15 * 60 },
  refreshIp: { limit: 60, windowSeconds: 15 * 60 },
} as const;

export const AUTH_CLEANUP = {
  consumedOtpRetentionSeconds: 24 * 60 * 60,
  revokedRefreshTokenRetentionSeconds: 7 * 24 * 60 * 60,
} as const;

export const USER_REGISTERED_EVENT = 'USER_REGISTERED';

export const AUTH_MESSAGES = {
  registrationRequested:
    'If this email can be registered, a verification code has been sent.',
  loginRequested:
    'If an account exists for this email, a login code has been sent.',
  invalidOtp: 'Invalid or expired verification code',
  accountUnavailable: 'This account is not available for sign in',
  invalidRefreshToken: 'Invalid or expired session',
  refreshTokenReuse:
    'This session has been revoked because the refresh token was reused',
  invalidRegistrationToken: 'Invalid or expired registration token',
  registrationExpired:
    'The registration session has expired. Start the registration again.',
  sessionNotFound: 'Session not found',
  sessionForbidden: 'You do not have permission to access this session',
  rateLimited: 'Too many requests. Please try again later.',
} as const;
