/**
 * Creates an admin account. Admins are never created through the API.
 *
 *   npm run admin:create -- --name "Neha Kapoor" --email neha@industrialink.in
 *
 * Works on any database (local or live). Prints a strong one-time password once:
 * give it to the admin privately; they log in and change it in Settings.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { prisma } from '../src/db/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { createAdminAccount } from '../src/modules/users/user.service.js';

const { values } = parseArgs({
  options: { name: { type: 'string' }, email: { type: 'string' } },
});

const input = z
  .object({
    name: z.string('Missing --name "Full Name"').trim().min(2, 'Name is too short.'),
    email: z.email('Missing or wrong --email address'),
  })
  .safeParse(values);

if (!input.success) {
  console.error(`Could not create admin:\n${z.prettifyError(input.error)}`);
  console.error('Usage: npm run admin:create -- --name "Full Name" --email you@company.com');
  process.exit(1);
}

try {
  const password = randomBytes(12).toString('base64url');
  const admin = await createAdminAccount({ ...input.data, passwordHash: await hashPassword(password) });
  console.warn(`Admin created: ${admin.name} <${admin.email}> (id ${admin.id})`);
  console.warn(`One-time password: ${password}  (shown only now; change it after the first login)`);
} catch (error) {
  console.error(`Could not create admin: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
