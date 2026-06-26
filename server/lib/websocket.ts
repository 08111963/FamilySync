import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAccessToken } from './jwt';
import { db } from '../db';
import { familyMembers, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger';
import { getBlockRelatedUserIds } from './block-filter';

let io: SocketIOServer | null = null;

function getAllowedOrigins(): string[] {
  const origins: string[] = ['http://localhost:8081'];

  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    origins.push(`https://${devDomain}`);
  }

  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    replitDomains.split(',').forEach(d => {
      origins.push(`https://${d.trim()}`);
    });
  }

  const publicDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (publicDomain) {
    origins.push(`https://${publicDomain}`);
  }

  return origins;
}

export function setupWebSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const user = verifyAccessToken(token);

      const [record] = await db
        .select({ emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, user.userId))
        .limit(1);

      if (!record) {
        return next(new Error('User not found'));
      }

      if (!record.emailVerified) {
        return next(new Error('Email not verified'));
      }

      socket.data.userId = user.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('WebSocket user connected', { userId: socket.data.userId });
    
    socket.on('join_family', async (familyId: string) => {
      if (!familyId || typeof familyId !== 'string') {
        socket.emit('error', { code: 'INVALID_FAMILY_ID', message: 'familyId non valido' });
        return;
      }

      try {
        const [membership] = await db
          .select()
          .from(familyMembers)
          .where(
            and(
              eq(familyMembers.userId, socket.data.userId),
              eq(familyMembers.familyId, familyId)
            )
          )
          .limit(1);

        if (!membership) {
          logger.warn('WebSocket join_family denied: not a member', {
            userId: socket.data.userId,
            familyId,
          });
          socket.emit('error', {
            code: 'NOT_FAMILY_MEMBER',
            message: 'Non fai parte di questa famiglia',
          });
          return;
        }

        socket.join(`family:${familyId}`);
        logger.info('WebSocket user joined family', {
          userId: socket.data.userId,
          familyId,
        });
      } catch (err) {
        logger.error('WebSocket join_family error', { error: String(err) });
        socket.emit('error', {
          code: 'SERVER_ERROR',
          message: 'Errore nel join della famiglia',
        });
      }
    });
    
    socket.on('leave_family', (familyId: string) => {
      socket.leave(`family:${familyId}`);
    });

    socket.on('chat:typing', async (data: { familyId: string; userName: string }) => {
      if (!data.familyId || !data.userName) return;
      const roomName = `family:${data.familyId}`;
      if (!socket.rooms.has(roomName)) return;
      try {
        await broadcastTypingToFamily(data.familyId, socket.data.userId, 'chat:typing', {
          userId: socket.data.userId,
          userName: data.userName,
        });
      } catch (err) {
        logger.error('WebSocket chat:typing error', { error: String(err) });
      }
    });

    socket.on('chat:stop_typing', async (data: { familyId: string }) => {
      if (!data.familyId) return;
      const roomName = `family:${data.familyId}`;
      if (!socket.rooms.has(roomName)) return;
      try {
        await broadcastTypingToFamily(data.familyId, socket.data.userId, 'chat:stop_typing', {
          userId: socket.data.userId,
        });
      } catch (err) {
        logger.error('WebSocket chat:stop_typing error', { error: String(err) });
      }
    });
    
    socket.on('disconnect', () => {
      logger.info('WebSocket user disconnected', { userId: socket.data.userId });
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function broadcastToFamily(familyId: string, event: string, data: any) {
  if (io) {
    io.to(`family:${familyId}`).emit(event, data);
  }
}

export async function notifyUserInFamily(
  familyId: string,
  userId: string,
  event: string,
  data: any
) {
  if (!io) return;

  const room = `family:${familyId}`;
  const sockets = await io.in(room).fetchSockets();
  for (const s of sockets) {
    if (s.data?.userId === userId) {
      s.emit(event, data);
    }
  }
}

export async function broadcastChatMessageToFamily(
  familyId: string,
  authorId: string,
  event: string,
  data: any
) {
  if (!io) return;

  const room = `family:${familyId}`;
  const sockets = await io.in(room).fetchSockets();
  if (sockets.length === 0) return;

  const blockedRelated = new Set(await getBlockRelatedUserIds(authorId, familyId));

  for (const s of sockets) {
    const uid = s.data?.userId as string | undefined;
    if (uid && uid !== authorId && blockedRelated.has(uid)) {
      continue;
    }
    s.emit(event, data);
  }
}

const BLOCK_CACHE_TTL_MS = 30_000;
const blockRelatedCache = new Map<string, { ids: Set<string>; expires: number }>();

// Indirection points so tests can drive the cache deterministically without a DB
// or real timers. Production always uses the real fetcher and Date.now.
let blockRelatedFetcher: (userId: string, familyId: string) => Promise<string[]> =
  getBlockRelatedUserIds;
let nowFn: () => number = () => Date.now();

export function __setBlockRelatedFetcherForTest(
  fn: (userId: string, familyId: string) => Promise<string[]>
) {
  blockRelatedFetcher = fn;
}

export function __setNowForTest(fn: () => number) {
  nowFn = fn;
}

export function __resetBlockCacheTestHooks() {
  blockRelatedFetcher = getBlockRelatedUserIds;
  nowFn = () => Date.now();
  blockRelatedCache.clear();
}

function sweepExpiredBlockCache(now: number) {
  for (const [key, entry] of blockRelatedCache) {
    if (entry.expires <= now) {
      blockRelatedCache.delete(key);
    }
  }
}

export async function getBlockRelatedCached(familyId: string, userId: string): Promise<Set<string>> {
  const key = `${familyId}:${userId}`;
  const now = nowFn();
  const hit = blockRelatedCache.get(key);
  if (hit && hit.expires > now) {
    return hit.ids;
  }
  if (blockRelatedCache.size > 1000) {
    sweepExpiredBlockCache(now);
  }
  const ids = new Set(await blockRelatedFetcher(userId, familyId));
  blockRelatedCache.set(key, { ids, expires: now + BLOCK_CACHE_TTL_MS });
  return ids;
}

// Pure predicate deciding whether a typing event should reach a given socket's
// user. The author never receives their own typing, and either side of a block
// relationship is excluded (bidirectional).
export function shouldReceiveTyping(
  uid: string | undefined,
  authorId: string,
  blockedRelated: Set<string>
): boolean {
  if (!uid || uid === authorId) return false;
  if (blockedRelated.has(uid)) return false;
  return true;
}

export function invalidateBlockCache(familyId: string, userId?: string) {
  if (userId) {
    blockRelatedCache.delete(`${familyId}:${userId}`);
    return;
  }
  const prefix = `${familyId}:`;
  for (const key of blockRelatedCache.keys()) {
    if (key.startsWith(prefix)) {
      blockRelatedCache.delete(key);
    }
  }
}

export async function broadcastTypingToFamily(
  familyId: string,
  authorId: string,
  event: string,
  data: any
) {
  if (!io) return;

  const room = `family:${familyId}`;
  const sockets = await io.in(room).fetchSockets();
  if (sockets.length === 0) return;

  const blockedRelated = await getBlockRelatedCached(familyId, authorId);

  for (const s of sockets) {
    const uid = s.data?.userId as string | undefined;
    if (shouldReceiveTyping(uid, authorId, blockedRelated)) {
      s.emit(event, data);
    }
  }
}
