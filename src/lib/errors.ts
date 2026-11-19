/**
 * An expected error with an HTTP status and a machine-readable code.
 * The error handler turns it into: { "message": "...", "code": "..." }.
 * `message` is shown to the user as it is, so write it in plain words.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') => new AppError(400, code, message);

export const unauthorized = (message = 'Please log in to continue.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);

export const forbidden = (message = 'You do not have access to this.', code = 'FORBIDDEN') =>
  new AppError(403, code, message);

export const notFound = (message = 'Not found.', code = 'NOT_FOUND') => new AppError(404, code, message);

export const conflict = (message: string, code = 'EXISTS') => new AppError(409, code, message);
