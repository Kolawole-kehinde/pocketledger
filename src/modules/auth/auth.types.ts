import type { DatabaseTransaction } from '../../infrastructure/database/database.types.js';
import type { OtpChallenge } from '../../infrastructure/database/schema/otp-challenges.schema.js';
import type { RefreshToken } from '../../infrastructure/database/schema/refresh-tokens.schema.js';
import type { Session } from '../../infrastructure/database/schema/sessions.schema.js';
import type { User } from '../../infrastructure/database/schema/users.schema.js';

export type AuthTransaction = DatabaseTransaction;

export type OtpPurpose = OtpChallenge['purpose'];

export type OtpIssueResult =
  | {
      status: 'issued';
      otp: string;
      expiresAt: Date;
      expiresInMinutes: number;
    }
  | {
      status: 'cooldown';
      retryAfterSeconds: number;
    };

export type OtpVerificationStatus =
  | 'verified'
  | 'invalid'
  | 'expired'
  | 'already_used'
  | 'too_many_attempts'
  | 'not_found';

export interface OtpVerificationResult {
  status: OtpVerificationStatus;
  challengeId?: string;
}

export interface SessionCreationResult {
  session: Session;
  refreshToken: string;
  refreshTokenRecord: RefreshToken;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  email: string;
  role: User['role'];
  type: 'access';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface RegistrationTokenPayload {
  sub: string;
  email: string;
  type: 'registration_completion';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface SessionWithTokens {
  session: Session;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
}

export type SessionCreationStatus =
  | {
      status: 'created';
      session: Session;
      refreshToken: string;
    }
  | {
      status: 'invalid';
    };

export type RefreshRotationResult =
  | {
      status: 'rotated';
      user: User;
      sessionId: string;
      refreshToken: string;
      refreshTokenExpiresAt: Date;
    }
  | {
      status: 'invalid' | 'expired' | 'reuse';
    };

