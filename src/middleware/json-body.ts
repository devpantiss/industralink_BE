import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH'];

/**
 * A body sent as plain text (e.g. Postman "raw → Text") would be silently ignored.
 * Say so clearly instead: bodies must be JSON, or multipart for file uploads.
 */
export function requireJsonBody(req: Request, _res: Response, next: NextFunction) {
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (
    METHODS_WITH_BODY.includes(req.method) &&
    hasBody &&
    !req.is(['application/json', 'multipart/form-data'])
  ) {
    throw new AppError(
      415,
      'NOT_JSON',
      'Send the body as JSON (Content-Type: application/json). In Postman: Body → raw → choose JSON.',
    );
  }
  next();
}
