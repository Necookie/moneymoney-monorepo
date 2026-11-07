/** Application error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);
export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable', message, details);

/** Map well-known Postgres constraint violations to client errors. */
export function fromDatabaseError(err: unknown): AppError | null {
  const e = (err as { cause?: unknown })?.cause ?? err;
  const code = (e as { code?: string })?.code;
  const constraint =
    (e as { constraint_name?: string; constraint?: string })?.constraint_name ??
    (e as { constraint?: string })?.constraint;
  switch (code) {
    case '23505':
      return conflict('A record with these values already exists', { constraint });
    case '23503':
      return unprocessable('A referenced record does not exist or is still in use', { constraint });
    case '23514':
      return unprocessable('The values violate a data rule', { constraint });
    case '22P02':
      return badRequest('Malformed value');
    default:
      return null;
  }
}
