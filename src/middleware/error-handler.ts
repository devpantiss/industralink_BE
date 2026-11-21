import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';

/**
 * The last middleware. Every error ends here and leaves as
 * { "message": "...", "code": "..." } with the right HTTP status.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join('.');
    const message = issue ? (field ? `${field}: ${issue.message}` : issue.message) : 'Invalid data.';
    res.status(422).json({ message, code: 'VALIDATION_ERROR' });
    return;
  }

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'File is too big. Max size is 5 MB.', code: 'TOO_BIG' });
    } else {
      res.status(400).json({ message: 'Send one file in a field called "file".', code: 'BAD_UPLOAD' });
    }
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'This already exists.', code: 'EXISTS' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Not found.', code: 'NOT_FOUND' });
      return;
    }
  }

  // Errors from express.json(): broken JSON or a body that is too big.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'The request body is not valid JSON.', code: 'INVALID_JSON' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'The request is too large.', code: 'TOO_LARGE' });
    return;
  }

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' });
};
