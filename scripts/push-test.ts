/**
 * Sends a test push to every phone a person is logged in on, and says what happened.
 *
 *   npm run push:test -- --phone 9876543210
 *   npm run push:test -- --email hr@konark.demo
 *
 * Needs FIREBASE_SERVICE_ACCOUNT in .env, and the person logged in on a phone
 * with notifications allowed.
 */
import { parseArgs } from 'node:util';
import { prisma } from '../src/db/prisma.js';
import { normalizeIndianPhone } from '../src/lib/phone.js';
import { isPushOn, sendPushNow } from '../src/modules/push/push.service.js';

const { values } = parseArgs({ options: { phone: { type: 'string' }, email: { type: 'string' } } });

async function main() {
  if (!isPushOn()) return 'Push is off: set FIREBASE_SERVICE_ACCOUNT in .env (see my-notes/PUSH_PLAN.md).';

  const phone = values.phone ? normalizeIndianPhone(values.phone) : null;
  const where = phone ? { phone } : values.email ? { email: values.email.toLowerCase() } : null;
  if (!where) return 'Usage: npm run push:test -- --phone 9876543210   (or --email hr@company.com)';

  const user = await prisma.user.findFirst({ where });
  if (!user) return 'No account with that phone or email.';

  const result = await sendPushNow(
    { id: user.id },
    { title: 'IndustriaLink test', body: `Hello ${user.name}, push notifications work.`, channel: 'updates' },
  );
  if (result.phones === 0)
    return `${user.name} has no phone registered: log in on the app and allow notifications.`;
  return `${user.name}: ${result.phones} phone(s), ${result.sent} sent, ${result.gone} removed (app gone), ${result.failed} failed.`;
}

try {
  console.warn(await main());
} catch (error) {
  console.error(`Test push failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
