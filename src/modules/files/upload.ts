import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { AppError } from '../../lib/errors.js';
import { detectFileType, EXTENSION, isImage, type AllowedMime } from './file-type.js';
import { putFile } from './storage.js';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;

/** Reads one multipart field called "file" into memory (max 5 MB). */
export const singleFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
}).single('file');

const tooBig = (mb: number) => new AppError(413, 'TOO_BIG', `File is too big. Max size is ${mb} MB.`);
const badType = (message: string) => new AppError(415, 'BAD_TYPE', message);

export interface StoredFile {
  key: string;
  mimeType: AllowedMime;
  sizeBytes: number;
}

/** Builds a storage key like "workers/<ownerId>/docs/<uuid>.pdf". */
const makeKey = (area: 'workers' | 'companies', ownerId: string, folder: string, mime: AllowedMime) =>
  `${area}/${ownerId}/${folder}/${randomUUID()}.${EXTENSION[mime]}`;

/** Checks an uploaded document (PDF or image) and saves it. */
export async function storeDocument(
  file: Express.Multer.File | undefined,
  area: 'workers' | 'companies',
  ownerId: string,
): Promise<StoredFile> {
  if (!file) throw new AppError(400, 'NO_FILE', 'Please choose a file.');
  const mimeType = detectFileType(file.buffer);
  if (!mimeType) throw badType('Please upload a photo (JPG/PNG/WEBP) or a PDF.');
  const key = makeKey(area, ownerId, 'docs', mimeType);
  await putFile(key, file.buffer);
  return { key, mimeType, sizeBytes: file.size };
}

const DATA_URL = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/;

/**
 * The apps send profile photos and logos as a small resized image inside the JSON
 * ("data:image/jpeg;base64,..."). This checks it and saves it as a file.
 */
export async function storeImageFromDataUrl(
  dataUrl: string,
  area: 'workers' | 'companies',
  ownerId: string,
  folder: 'photo' | 'logo',
): Promise<string> {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw badType('Please choose a JPG, PNG or WEBP image.');
  const data = Buffer.from(match[2]!, 'base64');
  if (data.length > MAX_IMAGE_BYTES) throw tooBig(1);
  const mimeType = detectFileType(data);
  if (!mimeType || !isImage(mimeType)) throw badType('Please choose a JPG, PNG or WEBP image.');
  const key = makeKey(area, ownerId, folder, mimeType);
  await putFile(key, data);
  return key;
}
