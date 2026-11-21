import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

/**
 * Where uploaded files live.
 *
 * For now files are kept on this server's disk (UPLOAD_DIR). When a storage service is chosen
 * (Cloudflare R2, Supabase Storage...), only this file changes: the rest of the code calls
 * putFile / deleteFile / fileUrl and keeps only the file "key" in the database.
 */

const root = path.resolve(env.UPLOAD_DIR);

/** Keys are always created by us, e.g. "workers/<id>/docs/<uuid>.pdf". */
const KEY_PATTERN = /^[a-z]+\/[0-9a-f-]{36}\/[a-z]+\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;

export const isValidKey = (key: string) => KEY_PATTERN.test(key);

function diskPath(key: string) {
  if (!isValidKey(key)) throw new Error(`Invalid file key: ${key}`);
  return path.join(root, key);
}

export async function putFile(key: string, data: Buffer): Promise<void> {
  const file = diskPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function readStoredFile(key: string): Promise<Buffer> {
  return readFile(diskPath(key));
}

/** Deleting a file that is already gone is not an error. */
export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (!key) return;
  await rm(diskPath(key), { force: true });
}

// ── Signed links ──
// Files are private. The API hands out links that only work for a short time,
// the same way R2 / S3 "presigned URLs" work.

const DEFAULT_LINK_MINUTES = 60;

function sign(key: string, expires: number) {
  return createHmac('sha256', env.JWT_SECRET).update(`file:${key}:${expires}`).digest('base64url');
}

/** A link to the file that stops working after `minutes`. */
export function fileUrl(key: string, minutes = DEFAULT_LINK_MINUTES): string {
  const expires = Math.floor(Date.now() / 1000) + minutes * 60;
  return `${env.PUBLIC_URL}/files/${key}?expires=${expires}&sig=${sign(key, expires)}`;
}

/** Optional link: undefined when there is no file. */
export const optionalFileUrl = (key: string | null | undefined, minutes?: number) =>
  key ? fileUrl(key, minutes) : undefined;

export function isValidSignature(key: string, expires: number, signature: string): boolean {
  if (!Number.isInteger(expires) || expires < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(key, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
