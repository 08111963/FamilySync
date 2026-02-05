import type { Express } from "express";
import { createServer, type Server } from "node:http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { setupWebSocket } from "./lib/websocket";

import authRoutes from "./routes/auth";
import familiesRoutes from "./routes/families";
import calendarRoutes from "./routes/calendar";
import shoppingRoutes from "./routes/shopping";
import choresRoutes from "./routes/chores";
import aiRoutes from "./routes/ai";
import paymentsRoutes from "./routes/payments";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/api/health',
  });

  app.use('/api', limiter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/families', familiesRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/shopping', shoppingRoutes);
  app.use('/api/chores', choresRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/payments', paymentsRoutes);

  const httpServer = createServer(app);

  const io = setupWebSocket(httpServer);
  app.set('io', io);

  return httpServer;
}
