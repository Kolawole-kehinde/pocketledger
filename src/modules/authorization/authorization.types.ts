import type { Request } from 'express';

import type { Role } from './roles.js';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  roles: Role[];
  sessionId: string;
  jti: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
