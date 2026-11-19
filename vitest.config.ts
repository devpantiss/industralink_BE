import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const fileEnv = config({ quiet: true }).parsed ?? {};
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is missing in .env');

export default defineConfig({
  test: {
    // Tests always use the separate test database, never the dev one.
    env: { ...fileEnv, NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl },
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
  },
});
