import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { verifyAccessToken } from './jwt';

let io: SocketIOServer | null = null;

export function setupWebSocket(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:8081',
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
    console.log('User connected:', socket.data.userId);
    
    socket.on('join_family', (familyId: string) => {
      socket.join(`family:${familyId}`);
      console.log(`User ${socket.data.userId} joined family ${familyId}`);
    });
    
    socket.on('leave_family', (familyId: string) => {
      socket.leave(`family:${familyId}`);
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.data.userId);
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
