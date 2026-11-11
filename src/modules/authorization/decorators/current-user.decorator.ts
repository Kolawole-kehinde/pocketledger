import {
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../authorization.types.js';

export const CurrentUser = createParamDecorator((
    field: keyof AuthenticatedUser | undefined,
    context: ExecutionContext,
  ): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    return field ? request.user[field] : request.user;
  },
);
