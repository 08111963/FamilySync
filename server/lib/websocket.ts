import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAccessToken } from './jwt';
import { db } from '../db';
import { familyMembers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger';

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

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const user = verifyAccessToken(token);
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
