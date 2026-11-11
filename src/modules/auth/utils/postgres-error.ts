interface PostgresErrorLike {
  code?: unknown;
  constraint?: unknown;
  detail?: unknown;
  cause?: unknown;
}

export interface PostgresErrorDetails {
  code: string;
  constraint?: string;
  detail?: string;
}

export function getPostgresError(
  error: unknown,
): PostgresErrorDetails | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as PostgresErrorLike;

  if (typeof candidate.code === 'string') {
    return {
      code: candidate.code,
      constraint:
        typeof candidate.constraint === 'string'
          ? candidate.constraint
          : undefined,
      detail:
        typeof candidate.detail === 'string'
          ? candidate.detail
          : undefined,
    };
  }

  if (candidate.cause) {
    return getPostgresError(candidate.cause);
  }

  return null;
}

export type UserUniqueField = 'email' | 'username' | 'phoneNumber';

export function getUserUniqueField(
  error: unknown,
): UserUniqueField | null {
  const postgresError = getPostgresError(error);

  if (!postgresError || postgresError.code !== '23505') {
    return null;
  }

  if (postgresError.constraint === 'users_email_unique') {
    return 'email';
  }

  if (postgresError.constraint === 'users_username_unique') {
    return 'username';
  }

  if (postgresError.constraint === 'users_phone_number_unique') {
    return 'phoneNumber';
  }

  const detail = postgresError.detail?.toLowerCase() ?? '';

  if (detail.includes('(email)')) {
    return 'email';
  }

  if (detail.includes('(username)')) {
    return 'username';
  }

  if (detail.includes('(phone_number)')) {
    return 'phoneNumber';
  }

  return null;
}
