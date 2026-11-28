import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const fileEnv = config({ quiet: true }).parsed ?? {};
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is missing in .env');

export default defineConfig({
  test: {
    // Tests always use the separate test database, never the dev one.
    env: {
      ...fileEnv,
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      UPLOAD_DIR: '.test-uploads',
      DEV_LOGIN: 'true',
      // Fixed, so the live-connection origin check is tested the same way everywhere.
      CORS_ORIGINS: 'http://localhost:5173',
      // Tests never reach Firebase; they use a fake sender (tests/push.test.ts).
      FIREBASE_SERVICE_ACCOUNT: '',
      // Tests never reach Google; they use a fake checker (tests/google-auth.test.ts).
      GOOGLE_CLIENT_IDS: '',
    },
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
  },
});
