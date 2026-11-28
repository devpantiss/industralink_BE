import { z } from 'zod';

/** The Firebase service account key: the downloaded JSON file, as base64 (or the JSON itself). */
const firebaseKey = z
  .string()
  .trim()
  .default('')
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      const json = value.startsWith('{') ? value : Buffer.from(value, 'base64').toString('utf8');
      const key = z
        .object({ project_id: z.string().min(1), client_email: z.email(), private_key: z.string().min(1) })
        .parse(JSON.parse(json));
      return { projectId: key.project_id, clientEmail: key.client_email, privateKey: key.private_key };
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'must be the Firebase service account JSON file as base64 (see my-notes/PUSH_PLAN.md)',
      });
      return z.NEVER;
    }
  });

/** Google sign-in: our OAuth client IDs (web, Android, iPhone), comma-separated. Not secret. */
const googleClientIds = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z
        .string()
        .regex(/^[\w-]+\.apps\.googleusercontent\.com$/, 'each id must end with .apps.googleusercontent.com'),
    ),
  );

/**
 * All settings come from environment variables (.env in development).
 * They are checked once at start-up: if something is missing or wrong,
 * the server stops with a clear message instead of failing later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  /** Address where this API is reachable; used to build file links. */
  PUBLIC_URL: z.url().optional(),
  /** Folder for uploaded files while files are stored on this server's disk. */
  UPLOAD_DIR: z.string().min(1).default('uploads'),
  /** Test login and test sign-up, for building the apps before the real login exists. Never in production. */
  DEV_LOGIN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /** Push notifications through Firebase. Without it, push is off and everything else works. */
  FIREBASE_SERVICE_ACCOUNT: firebaseKey,
  /** Google sign-in. Without it, "Sign in with Google" answers "not available" and everything else works. */
  GOOGLE_CLIENT_IDS: googleClientIds,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.DEV_LOGIN) {
  console.error('DEV_LOGIN must not be turned on in production.');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  PUBLIC_URL: (parsed.data.PUBLIC_URL ?? `http://localhost:${parsed.data.PORT}`).replace(/\/$/, ''),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
