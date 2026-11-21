import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { config } from 'dotenv';

function run(command: string, env: NodeJS.ProcessEnv) {
  try {
    execSync(command, { env, stdio: 'pipe' });
  } catch (error) {
    const output = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`"${command}" failed. Is the database running? (npm run db:up)\n${output ?? ''}`, {
      cause: error,
    });
  }
}

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
  run('npx prisma migrate deploy', env);
  run('npx prisma db seed', env);

  // After all tests: remove files uploaded during the tests.
  return () => rmSync('.test-uploads', { recursive: true, force: true });
}
