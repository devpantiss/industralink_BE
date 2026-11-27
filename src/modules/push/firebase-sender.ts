import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { type BaseMessage, type BatchResponse, getMessaging } from 'firebase-admin/messaging';
import type { PushIdKind } from '../../generated/prisma/client.js';
import type { PushMessage, PushOutcome, PushSender, PushTarget } from './push.service.js';

/** Firebase sends to at most 500 phones per call. */
const BATCH_SIZE = 500;

/** Errors that mean this phone will never get pushes on this id again. */
const GONE_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/installation-id-not-registered',
]);

/** The same notification for Android, iPhone and the web. */
function toFirebase({ title, body, link, channel, group }: PushMessage): BaseMessage {
  return {
    notification: { title, body },
    // Read by the app (values must be strings). On Android the app shows the notification
    // itself, and `tag` makes a new one replace the old one.
    data: {
      channel,
      ...(link && { link }),
      ...(group && { group, tag: group }),
    },
    android: {
      priority: 'high',
      notification: { channelId: channel, tag: group, sound: 'default' },
    },
    apns: { payload: { aps: { sound: 'default', threadId: group } } },
  };
}

/**
 * Sends through Firebase Cloud Messaging.
 * Phones give us either an old registration token or a new Firebase installation id;
 * each kind goes in its own field.
 */
export function firebaseSender(key: ServiceAccount): PushSender {
  const messaging = getMessaging(initializeApp({ credential: cert(key) }, 'push'));

  const sendBatch = (kind: PushIdKind, ids: string[], base: BaseMessage): Promise<BatchResponse> =>
    kind === 'fid'
      ? messaging.sendEachForMulticast({ ...base, fids: ids })
      : messaging.sendEachForMulticast({ ...base, tokens: ids });

  return {
    async send(targets: PushTarget[], message: PushMessage) {
      const base = toFirebase(message);
      const outcomes: PushOutcome[] = targets.map(() => 'failed');

      for (const kind of ['token', 'fid'] as const) {
        const positions = targets.flatMap((target, index) => (target.kind === kind ? [index] : []));
        for (let start = 0; start < positions.length; start += BATCH_SIZE) {
          const batch = positions.slice(start, start + BATCH_SIZE);
          const { responses } = await sendBatch(
            kind,
            batch.map((index) => targets[index]!.token),
            base,
          );
          responses.forEach((response, i) => {
            outcomes[batch[i]!] = response.success
              ? 'sent'
              : GONE_ERRORS.has(response.error?.code ?? '')
                ? 'gone'
                : 'failed';
          });
        }
      }
      return outcomes;
    },
  };
}
