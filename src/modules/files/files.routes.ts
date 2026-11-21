import { Router } from 'express';
import { forbidden, notFound } from '../../lib/errors.js';
import { detectFileType } from './file-type.js';
import { isValidKey, isValidSignature, readStoredFile } from './storage.js';

/**
 * Serves files kept on this server's disk, only through signed links made by fileUrl().
 * Goes away when a storage service (R2 etc.) serves the files directly.
 */
export const filesRouter = Router();

filesRouter.get('/*key', async (req, res) => {
  const key = ([] as string[]).concat(req.params.key ?? []).join('/');
  const expires = Number(req.query.expires);
  const signature = typeof req.query.sig === 'string' ? req.query.sig : '';

  if (!isValidKey(key)) throw notFound('File not found.');
  if (!isValidSignature(key, expires, signature)) {
    throw forbidden('This file link has expired. Please open it again from the app.', 'LINK_EXPIRED');
  }

  let data: Buffer;
  try {
    data = await readStoredFile(key);
  } catch {
    throw notFound('File not found.');
  }

  res.set({
    'Content-Type': detectFileType(data) ?? 'application/octet-stream',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, max-age=300',
    // The apps run on other addresses, so let them show these images and PDFs.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.send(data);
});
