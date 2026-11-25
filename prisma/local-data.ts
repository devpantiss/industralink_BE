/**
 * Shared by the demo data (seed.ts) and the clear script (clear.ts).
 * Both wipe everything, so they only ever run on a database on this computer.
 */
import { rmSync } from 'node:fs';
import { prisma } from '../src/db/prisma.js';

/** Empties every table, and the uploaded files that belonged to them. */
export async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  rmSync(process.env.UPLOAD_DIR ?? 'uploads', { recursive: true, force: true });
}

/** Stops unless the database is on this computer, so a live database can never be wiped. */
export function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to wipe: "${host || 'unknown'}" is not a database on this computer.`);
  }
}
