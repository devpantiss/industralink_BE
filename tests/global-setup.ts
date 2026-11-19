import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/**
 * Before all tests: bring the TEST database up to date with the migrations,
 * then refill it with demo data (the seed script clears the tables first).
 */
export default function setup() {
  const fileEnv = config({ quiet: true }).parsed ?? {};
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL,
  };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx prisma db seed', { env, stdio: 'pipe' });
}
