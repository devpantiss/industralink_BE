import type { IncomingMessage, Server } from 'node:http';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { authenticate } from '../middleware/auth.js';
import { onTyping } from '../modules/messages/chat-events.js';
import {
  CLOSE,
  type LiveClient,
  MAX_CONNECTIONS_PER_USER,
  addClient,
  allClients,
  connectionsOf,
  removeClient,
} from './live-hub.js';

/** The app must log in within this time after connecting. */
const AUTH_TIMEOUT_MS = 10_000;
/** How often we ping each connection and check its session again. */
const HEARTBEAT_MS = 30_000;
/** Messages from the apps are tiny ("typing"). Anything bigger is refused. */
const MAX_MESSAGE_BYTES = 4 * 1024;

/** What the apps may send. Sending chat messages goes through the normal API, not here. */
const incomingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().max(2000) }),
  z.object({ type: z.literal('typing'), applicationId: z.uuid() }),
]);

function parseIncoming(data: RawData) {
  try {
    const result = incomingSchema.safeParse(JSON.parse(data.toString()));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Browsers send their page address (Origin). On the live server only our own sites may
 * connect. The phone app sends no Origin, and that is fine: it must still log in.
 */
function isAllowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return !origin || env.CORS_ORIGINS.length === 0 || env.CORS_ORIGINS.includes(origin);
}

/**
 * Live updates for chat, at ws(s)://<host>/ws on the same port as the API.
 *
 * 1. The app connects, then sends { type: "auth", token } as the FIRST message
 *    (not in the URL, so the token never ends up in logs).
 * 2. The server answers { type: "ready" }, then sends events (see LiveEvent).
 * 3. The app may send { type: "typing", applicationId }.
 * Every 30 s the server pings and checks the session again, so logging out or
 * blocking ends the connection.
 */
export function attachLiveServer(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient: ({ req }: { req: IncomingMessage }) => isAllowedOrigin(req),
  });

  wss.on('connection', (socket) => {
    let client: LiveClient | null = null;

    const authTimer = setTimeout(() => socket.close(CLOSE.AUTH_TIMEOUT, 'Log in first.'), AUTH_TIMEOUT_MS);

    socket.on('message', async (data) => {
      const incoming = parseIncoming(data);
      if (!incoming) return; // Unknown or broken messages are ignored.

      if (!client) {
        if (incoming.type !== 'auth') return socket.close(CLOSE.UNAUTHORIZED, 'Log in first.');
        clearTimeout(authTimer);
        client = await login(socket, incoming.token);
        return;
      }
      if (incoming.type === 'typing') {
        await onTyping(client.user, incoming.applicationId).catch((error: unknown) =>
          logger.warn({ err: error }, 'Typing event failed'),
        );
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (client) removeClient(client);
    });
    socket.on('error', (error) => logger.warn({ err: error }, 'Live connection error'));
  });

  const heartbeat = setInterval(() => void checkConnections(), HEARTBEAT_MS);
  heartbeat.unref();

  return {
    close() {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      wss.close();
    },
  };
}

/** Checks the token like any API request. Returns the client, or closes the socket. */
async function login(socket: WebSocket, token: string): Promise<LiveClient | null> {
  let auth;
  try {
    auth = await authenticate(token);
  } catch {
    socket.close(CLOSE.UNAUTHORIZED, 'Please log in again.');
    return null;
  }
  if (auth.user.role === 'admin') {
    socket.close(CLOSE.NOT_ALLOWED, 'Live updates are for workers and employers.');
    return null;
  }
  if (connectionsOf(auth.user.id) >= MAX_CONNECTIONS_PER_USER) {
    socket.close(CLOSE.TOO_MANY, 'Too many open connections.');
    return null;
  }
  // The socket may have closed while the login was checked.
  if (socket.readyState !== WebSocket.OPEN) return null;

  const client: LiveClient = { socket, user: auth.user, sessionId: auth.sessionId, token, alive: true };
  socket.on('pong', () => {
    client.alive = true;
  });
  addClient(client);
  socket.send(JSON.stringify({ type: 'ready' }));
  return client;
}

/**
 * Every 30 s: a connection that didn't answer the last ping is dead and is dropped.
 * The others are pinged, and their session is checked again (logout, block, expiry).
 */
export async function checkConnections() {
  await Promise.all(
    allClients().map(async (client) => {
      if (!client.alive) return client.socket.terminate();
      client.alive = false;
      client.socket.ping();
      try {
        const { user } = await authenticate(client.token);
        if (client.socket.readyState !== WebSocket.OPEN) return;
        // Keep the latest account details (e.g. the company it belongs to).
        removeClient(client);
        client.user = user;
        addClient(client);
      } catch {
        client.socket.close(CLOSE.UNAUTHORIZED, 'Please log in again.');
      }
    }),
  );
}
