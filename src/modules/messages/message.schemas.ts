import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 1000;

/** Most line breaks allowed in a row. More than this is almost always spam. */
const MAX_LINE_BREAKS = 10;

/**
 * Control characters (all except the line break), zero-width characters and
 * text-direction marks. Matching them is the point here, so the lint rule is off.
 */
const INVISIBLE_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/**
 * Cleans what the person typed before it is saved:
 * - Windows line breaks become normal ones, tabs become spaces.
 * - Invisible characters are removed: control characters, zero-width characters and
 *   text-direction tricks that can hide or reverse what a message says.
 * - Line breaks are kept, but at most 10 in a row.
 * - Spaces at the start and end are removed.
 */
export function cleanMessageText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(new RegExp(`\\n{${MAX_LINE_BREAKS + 1},}`, 'g'), '\n'.repeat(MAX_LINE_BREAKS))
    .trim();
}

/** POST /messages/:applicationId */
export const sendMessageSchema = z.object({
  text: z
    .string('Write a message first.')
    .transform(cleanMessageText)
    .pipe(
      z
        .string()
        .min(1, 'Write a message first.')
        .max(MAX_MESSAGE_LENGTH, `Keep messages under ${MAX_MESSAGE_LENGTH} characters.`),
    ),
  /** Made by the app, so a retry after a network error doesn't send the message twice. */
  clientId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, 'clientId can have letters, numbers, - and _ (up to 64).')
    .optional(),
});

/** GET /messages/:applicationId: ?before=<messageId> loads older, ?after=<messageId> only newer. */
export const threadQuerySchema = z
  .object({
    before: z.uuid('Unknown message.').optional(),
    after: z.uuid('Unknown message.').optional(),
  })
  .refine((query) => !(query.before && query.after), { message: 'Use before or after, not both.' });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ThreadQuery = z.infer<typeof threadQuerySchema>;
