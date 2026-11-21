/**
 * Detects the real file type from its first bytes. The type sent by the browser
 * can be faked, so uploads are always checked this way.
 */
export type AllowedMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

export const EXTENSION: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, i) => data[offset + i] === byte);

export function detectFileType(data: Buffer): AllowedMime | null {
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'; // RIFF....WEBP
  }
  return null;
}

export const isImage = (mime: AllowedMime) => mime.startsWith('image/');
