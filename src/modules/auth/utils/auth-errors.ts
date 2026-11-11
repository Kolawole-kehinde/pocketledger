import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

interface AuthErrorBody {
  statusCode: number;
  code: string;
  message: string;
  [key: string]: unknown;
}

function body(
  statusCode: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): AuthErrorBody {
  return {
    statusCode,
    code,
    message,
    ...extra,
  };
}

export function authUnauthorized(
  code: string,
  message: string,
): UnauthorizedException {
  return new UnauthorizedException(body(401, code, message));
}

export function authBadRequest(
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): BadRequestException {
  return new BadRequestException(body(400, code, message, extra));
}

export function authForbidden(
  code: string,
  message: string,
): ForbiddenException {
  return new ForbiddenException(body(403, code, message));
}

export function authNotFound(
  code: string,
  message: string,
): NotFoundException {
  return new NotFoundException(body(404, code, message));
}

export function authConflict(
  code: string,
  message: string,
): ConflictException {
  return new ConflictException(body(409, code, message));
}

export function authRateLimited(
  message: string,
  retryAfterSeconds: number,
): HttpException {
  return new HttpException(
    body(429, 'RATE_LIMITED', message, { retryAfterSeconds }),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
