import { z } from 'zod';

/** PUT /me/push-token: the id this phone got from Firebase. */
export const savePushTokenSchema = z.object({
  token: z
    .string('Missing token.')
    .trim()
    .min(10, 'This is not a push token.')
    .max(4096, 'This is not a push token.')
    .regex(/^[\w:.-]+$/, 'This is not a push token.'),
  /** "fid" for a Firebase installation id; "token" (default) for a registration token. */
  kind: z.enum(['token', 'fid']).default('token'),
  platform: z.enum(['android', 'ios', 'web'], 'Platform must be android, ios or web.'),
});

export type SavePushTokenInput = z.infer<typeof savePushTokenSchema>;
