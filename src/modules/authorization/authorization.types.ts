import type { Request } from 'express';
import type { User } from '../../infrastructure/database/schema/users.schema.js';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: User['role'];
  sessionId: string;
  jti: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
