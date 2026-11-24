import type { WebSocket } from 'ws';
import type { User } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';

/**
 * Who is connected right now, and sending events to them.
 *
 * The live connection only says "something changed"; the database stays the truth.
 * If an event is lost (phone offline, server restart), the app catches up through the
 * normal API when it reconnects. So sending here is "best effort" and never throws.
 *
 * Everything is in this server's memory. With more than one server later, events go
 * between servers with PostgreSQL LISTEN/NOTIFY (see my-notes/CHAT_PLAN.md).
 */

/** Close codes the apps understand (4000–4999 are free for apps to use). */
export const CLOSE = {
  /** Not logged in, session ended, or the account is blocked: log in again, don't retry. */
  UNAUTHORIZED: 4001,
  /** Logged in, but this role has no live updates (admins). Don't retry. */
  NOT_ALLOWED: 4003,
  /** The first message wasn't a login in time. Retry is fine. */
  AUTH_TIMEOUT: 4008,
  /** Too many open connections for one person. */
  TOO_MANY: 4029,
} as const;

/** One open connection (a browser tab or a phone). */
export interface LiveClient {
  socket: WebSocket;
  user: User;
  sessionId: string;
  /** The token is kept to check the session again from time to time. */
  token: string;
  /** False after a ping until the pong comes back. */
  alive: boolean;
}

/** The events the apps get. */
export type LiveEvent =
  | { type: 'ready' }
  | { type: 'message:new'; message: Record<string, unknown> }
  | { type: 'chat:read'; applicationId: string; side: 'worker' | 'company'; at: string }
  | { type: 'chat:typing'; applicationId: string; side: 'worker' | 'company' }
  | { type: 'chat:changed'; applicationId: string }
  | { type: 'messaging:changed'; enabled: boolean };

/** Most open connections per person (tabs + phones). */
export const MAX_CONNECTIONS_PER_USER = 10;

const byUser = new Map<string, Set<LiveClient>>();
const byCompany = new Map<string, Set<LiveClient>>();

function addTo(index: Map<string, Set<LiveClient>>, key: string, client: LiveClient) {
  const set = index.get(key) ?? new Set();
  set.add(client);
  index.set(key, set);
}

function removeFrom(index: Map<string, Set<LiveClient>>, key: string, client: LiveClient) {
  const set = index.get(key);
  set?.delete(client);
  if (set?.size === 0) index.delete(key);
}

export function connectionsOf(userId: string): number {
  return byUser.get(userId)?.size ?? 0;
}

export function addClient(client: LiveClient) {
  addTo(byUser, client.user.id, client);
  if (client.user.companyId) addTo(byCompany, client.user.companyId, client);
}

export function removeClient(client: LiveClient) {
  removeFrom(byUser, client.user.id, client);
  if (client.user.companyId) removeFrom(byCompany, client.user.companyId, client);
}

/** Is the person connected right now? (Phone push is only for people who aren't.) */
export function isOnline(userId: string): boolean {
  return connectionsOf(userId) > 0;
}

function send(client: LiveClient, event: LiveEvent) {
  if (client.socket.readyState !== client.socket.OPEN) return;
  client.socket.send(JSON.stringify(event), (error) => {
    if (error) logger.warn({ err: error, userId: client.user.id }, 'Live event not delivered');
  });
}

export function sendToUser(userId: string, event: LiveEvent) {
  for (const client of byUser.get(userId) ?? []) send(client, event);
}

/** Every connected HR user of the company. */
export function sendToCompany(companyId: string, event: LiveEvent) {
  for (const client of byCompany.get(companyId) ?? []) {
    if (client.user.role === 'employer') send(client, event);
  }
}

export function sendToEveryone(event: LiveEvent) {
  for (const clients of byUser.values()) for (const client of clients) send(client, event);
}

/** Ends live connections, e.g. after logout or blocking. */
function closeWhere(clients: Iterable<LiveClient>, matches: (client: LiveClient) => boolean) {
  for (const client of [...clients]) {
    if (matches(client)) client.socket.close(CLOSE.UNAUTHORIZED, 'Please log in again.');
  }
}

export function closeSession(sessionId: string) {
  for (const clients of byUser.values()) closeWhere(clients, (client) => client.sessionId === sessionId);
}

export function closeUser(userId: string) {
  closeWhere(byUser.get(userId) ?? [], () => true);
}

/** All open connections (for the heartbeat). */
export function allClients(): LiveClient[] {
  return [...byUser.values()].flatMap((clients) => [...clients]);
}
