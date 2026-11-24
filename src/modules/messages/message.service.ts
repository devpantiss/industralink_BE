import { type Db, prisma } from '../../db/prisma.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { invalid } from '../../lib/errors.js';
import {
  type Chat,
  type ChatSide,
  chatInclude,
  chatsOf,
  findChat,
  isMessagingOn,
  whyChatIsClosed,
} from './chat-access.js';
import { chatRead, messageSent } from './chat-events.js';
import { otherSide, previewOf, sideFields, toMessageDto, toThreadDto } from './message.mapper.js';
import type { SendMessageInput, ThreadQuery } from './message.schemas.js';

/** Messages per page when a chat opens or scrolls up. */
const PAGE_SIZE = 50;
/** Most new messages one "what's new" (?after=) call returns. */
const CATCH_UP_LIMIT = 200;
/** Most chats the inbox lists. */
const INBOX_LIMIT = 200;

/**
 * Locks the chat row until the transaction ends. Sending and reading the same chat
 * then happen one after the other, so the unread counts and "seen" ticks stay exact.
 */
async function lockChat(tx: Db, applicationId: string) {
  await tx.$queryRaw`SELECT 1 FROM "conversations" WHERE "applicationId" = ${applicationId}::uuid FOR UPDATE`;
}

/** GET /messages: the user's chats, newest activity first. One query. */
export async function listThreads(user: User) {
  const owner = chatsOf(user);
  if (!owner) return [];

  const [chats, messagingOn] = await Promise.all([
    prisma.conversation.findMany({
      where: owner.where,
      include: chatInclude,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: INBOX_LIMIT,
    }),
    isMessagingOn(),
  ]);
  return chats.map((chat) => toThreadDto(chat, owner.side, whyChatIsClosed(chat, messagingOn) === null));
}

/**
 * The user has seen everything in the chat up to now: their unread count goes to 0
 * and their "last read" time moves on (the other side's ticks turn blue).
 * Writes nothing when there is nothing new, because the apps call this on every refresh.
 */
async function markChatRead(chat: Chat, side: ChatSide): Promise<Chat> {
  const { unread, lastReadAt } = sideFields(side);
  const at = new Date();
  const { count } = await prisma.conversation.updateMany({
    where: {
      applicationId: chat.applicationId,
      OR: [{ [unread]: { gt: 0 } }, { [lastReadAt]: null }],
    },
    data: { [unread]: 0, [lastReadAt]: at },
  });
  if (count === 0) return chat;
  chatRead(chat, side, at);
  return prisma.conversation.findUniqueOrThrow({
    where: { applicationId: chat.applicationId },
    include: chatInclude,
  });
}

/** POST /messages/:applicationId/read */
export async function markRead(user: User, applicationId: string) {
  const { chat, side } = await findChat(user, applicationId);
  await markChatRead(chat, side);
}

/** The message a ?before= or ?after= cursor points to. It must be in this chat. */
async function findCursor(applicationId: string, messageId: string) {
  const cursor = await prisma.message.findFirst({
    where: { id: messageId, applicationId },
    select: { id: true, createdAt: true },
  });
  if (!cursor) throw invalid('That message is not in this chat.', 'BAD_CURSOR');
  return cursor;
}

/**
 * GET /messages/:applicationId
 * - No query: opens the chat. Marks it read, returns the newest 50 messages.
 * - ?before=<id>: the 50 messages before that one (scrolling up).
 * - ?after=<id>: only messages after that one (refresh / catch-up). Doesn't mark read.
 * Messages are always oldest first. `hasMore` says if there are more in that direction.
 */
export async function openThread(user: User, applicationId: string, query: ThreadQuery) {
  const found = await findChat(user, applicationId);
  const { side } = found;
  let { chat } = found;

  let messages;
  let hasMore: boolean;

  if (query.after) {
    const cursor = await findCursor(applicationId, query.after);
    const rows = await prisma.message.findMany({
      where: {
        applicationId,
        OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: CATCH_UP_LIMIT + 1,
    });
    hasMore = rows.length > CATCH_UP_LIMIT;
    messages = rows.slice(0, CATCH_UP_LIMIT);
  } else {
    // Mark read first, then load: every message saved before the mark is in the list.
    if (!query.before) chat = await markChatRead(chat, side);
    const cursor = query.before ? await findCursor(applicationId, query.before) : null;
    const rows = await prisma.message.findMany({
      where: {
        applicationId,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
    });
    hasMore = rows.length > PAGE_SIZE;
    messages = rows.slice(0, PAGE_SIZE).reverse();
  }

  const canSend = whyChatIsClosed(chat, await isMessagingOn()) === null;
  return {
    thread: toThreadDto(chat, side, canSend),
    messages: messages.map((message) => toMessageDto(message, chat, side)),
    hasMore,
  };
}

/**
 * POST /messages/:applicationId
 * Saves the message and updates the chat row (last message, the other side's unread +1)
 * in one transaction. With the same clientId again, returns the first message instead
 * of saving a copy. `created` is false in that case.
 */
export async function sendMessage(user: User, applicationId: string, input: SendMessageInput) {
  const { chat, side } = await findChat(user, applicationId);
  const closed = whyChatIsClosed(chat, await isMessagingOn());
  if (closed) throw closed;

  const sent = (await findResend(user, applicationId, input)) ?? (await saveMessage(user, chat, side, input));
  if (sent.created) messageSent(sent.message, sent.chat);
  return { message: toMessageDto(sent.message, sent.chat, side), created: sent.created };
}

/** A message this user already sent with the same clientId (a retry), if any. */
async function findResend(user: User, applicationId: string, input: SendMessageInput) {
  if (!input.clientId) return null;
  const message = await prisma.message.findUnique({
    where: { senderId_clientId: { senderId: user.id, clientId: input.clientId } },
  });
  if (!message) return null;
  if (message.applicationId !== applicationId) {
    throw invalid('This clientId was already used for another chat.', 'CLIENT_ID_USED');
  }
  const chat = await prisma.conversation.findUniqueOrThrow({
    where: { applicationId },
    include: chatInclude,
  });
  return { message, chat, created: false };
}

async function saveMessage(user: User, chat: Chat, side: ChatSide, input: SendMessageInput) {
  const mine = sideFields(side);
  const theirs = sideFields(otherSide(side));
  try {
    return await prisma.$transaction(async (tx) => {
      await lockChat(tx, chat.applicationId);
      // The time is taken after the lock, so it's later than any "last read" saved before.
      const at = new Date();
      const message = await tx.message.create({
        data: {
          applicationId: chat.applicationId,
          senderId: user.id,
          senderRole: user.role,
          text: input.text,
          clientId: input.clientId ?? null,
          createdAt: at,
        },
      });
      const updated = await tx.conversation.update({
        where: { applicationId: chat.applicationId },
        data: {
          lastMessageAt: at,
          lastMessageText: previewOf(input.text),
          lastSenderId: user.id,
          [theirs.unread]: { increment: 1 },
          // Writing in a chat means you've read it.
          [mine.unread]: 0,
          [mine.lastReadAt]: at,
        },
        include: chatInclude,
      });
      return { message, chat: updated, created: true };
    });
  } catch (error) {
    // Two copies of the same retry arrived at the same moment: the other one was saved.
    const isDuplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    const resend = isDuplicate ? await findResend(user, chat.applicationId, input) : null;
    if (resend) return resend;
    throw error;
  }
}
