import { SetMetadata } from '@nestjs/common';
import type { User } from '../../../infrastructure/database/schema/users.schema.js';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Array<User['role']>) =>
  SetMetadata(ROLES_KEY, roles);

