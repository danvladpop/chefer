/**
 * Base domain error class.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when a user is not found.
 */
export class UserNotFoundError extends DomainError {
  constructor(identifier: string) {
    super(`User not found: ${identifier}`, 'USER_NOT_FOUND', 404);
    this.name = 'UserNotFoundError';
  }
}

/**
 * Thrown when trying to create a user with an email that already exists.
 */
export class UserEmailConflictError extends DomainError {
  constructor(email: string) {
    super(`User with email "${email}" already exists`, 'USER_EMAIL_CONFLICT', 409);
    this.name = 'UserEmailConflictError';
  }
}

/**
 * Thrown when a user provides invalid credentials during authentication.
 */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Thrown when a user tries to perform an action they don't have permission for.
 */
export class UserPermissionError extends DomainError {
  constructor(action: string) {
    super(`You do not have permission to ${action}`, 'PERMISSION_DENIED', 403);
    this.name = 'UserPermissionError';
  }
}

/**
 * Thrown when a user's account is locked or suspended.
 */
export class UserAccountLockedError extends DomainError {
  constructor(userId: string) {
    super(`User account ${userId} is locked`, 'ACCOUNT_LOCKED', 403);
    this.name = 'UserAccountLockedError';
  }
}

/**
 * Thrown when a user's email is not verified but verification is required.
 */
export class EmailNotVerifiedError extends DomainError {
  constructor() {
    super(
      'Please verify your email address before continuing',
      'EMAIL_NOT_VERIFIED',
      403,
    );
    this.name = 'EmailNotVerifiedError';
  }
}

/**
 * Maps domain errors to tRPC error codes.
 */
export function domainErrorToTRPCCode(
  error: DomainError,
): 'NOT_FOUND' | 'CONFLICT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST' {
  switch (error.code) {
    case 'USER_NOT_FOUND':
      return 'NOT_FOUND';
    case 'USER_EMAIL_CONFLICT':
      return 'CONFLICT';
    case 'INVALID_CREDENTIALS':
      return 'UNAUTHORIZED';
    case 'PERMISSION_DENIED':
    case 'ACCOUNT_LOCKED':
    case 'EMAIL_NOT_VERIFIED':
      return 'FORBIDDEN';
    default:
      return 'BAD_REQUEST';
  }
}
