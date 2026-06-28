import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { setupWebSocket } from "./lib/websocket";
import { authenticate, authenticateMedia, requireEmailVerified } from "./middleware/auth";

import authRoutes from "./routes/auth";
import familiesRoutes from "./routes/families";
import invitesRoutes, { inviteLimiter } from "./routes/invites";
import calendarRoutes from "./routes/calendar";
import shoppingRoutes from "./routes/shopping";
import choresRoutes from "./routes/chores";
import aiRoutes from "./routes/ai";
import paymentsRoutes from "./routes/payments";
import purchasesRoutes, { handleRevenueCatWebhook } from "./routes/purchases";
import legalRoutes from "./routes/legal";
import helpRoutes from "./routes/help";
import moderationRoutes from "./routes/moderation";
import recipesRoutes from "./routes/recipes";
import mealPlansRoutes from "./routes/meal-plans";
import chatRoutes from "./routes/chat";
import notificationsRoutes from "./routes/notifications";
import billsRoutes from "./routes/bills";
import migrateRoutes from "./routes/migrate";

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

  // Endpoint TEMPORANEO di migrazione dati (disattivo se MIGRATE_TOKEN assente).
  app.use('/api/_migrate', migrateRoutes);
  app.use('/api/auth', authRoutes);
  // Inviti: router PUBBLICO (lookup stato + accept nuovo utente) montato senza
  // authenticate, con rate limiter dedicato.
  app.use('/api/invites', inviteLimiter, invitesRoutes);
  app.use('/api/families', authenticate, requireEmailVerified, familiesRoutes);
  app.use('/api/calendar', authenticate, requireEmailVerified, calendarRoutes);
  app.use('/api/shopping', authenticate, requireEmailVerified, shoppingRoutes);
  app.use('/api/chores', authenticate, requireEmailVerified, choresRoutes);
  app.use('/api/ai', authenticate, requireEmailVerified, aiRoutes);
  app.use('/api/payments', authenticate, requireEmailVerified, paymentsRoutes);
  // Webhook RevenueCat: pubblico (nessun JWT), autenticato via header. Va
  // registrato PRIMA del mount autenticato di /api/purchases.
  app.post('/api/purchases/webhook', handleRevenueCatWebhook);
  app.use('/api/purchases', authenticate, requireEmailVerified, purchasesRoutes);
  app.use('/api/moderation', authenticate, requireEmailVerified, moderationRoutes);
  app.use('/api/recipes', authenticate, requireEmailVerified, recipesRoutes);
  app.use('/api/meal-plans', authenticate, requireEmailVerified, mealPlansRoutes);
  app.use('/api/chat', authenticate, requireEmailVerified, chatRoutes);
  app.use('/api/notifications', authenticate, requireEmailVerified, notificationsRoutes);
  app.use('/api/bills', authenticate, requireEmailVerified, billsRoutes);

  app.use('/uploads', authenticateMedia, requireEmailVerified, express.static('uploads'));

  app.use('/legal', legalRoutes);
  app.use('/privacy', (req, res, next) => { req.url = '/privacy'; legalRoutes(req, res, next); });
  app.use('/terms', (req, res, next) => { req.url = '/terms'; legalRoutes(req, res, next); });
  app.use('/help', helpRoutes);

  const httpServer = createServer(app);

  const io = setupWebSocket(httpServer);
  app.set('io', io);

  return httpServer;
}
