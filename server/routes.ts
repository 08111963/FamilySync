import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { setupWebSocket } from "./lib/websocket";
import { authenticate, authenticateMedia, requireEmailVerified } from "./middleware/auth";

import authRoutes from "./routes/auth";
import familiesRoutes from "./routes/families";
import invitesRoutes, { inviteLimiter } from "./routes/invites";
import joinLinkRoutes, { joinLinkLimiter } from "./routes/join-link";
import calendarRoutes from "./routes/calendar";
import calendarFeedRoutes from "./routes/calendar-feed";
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
import supportRoutes from "./routes/support";
import profileRoutes from "./routes/profile";

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
  // Inviti: router PUBBLICO (lookup stato + accept nuovo utente) montato senza
  // authenticate, con rate limiter dedicato.
  app.use('/api/invites', inviteLimiter, invitesRoutes);
  // Link/QR RIUTILIZZABILE: router PUBBLICO (lookup stato + accept nuovo utente
  // con la PROPRIA email), montato senza authenticate, con rate limiter dedicato.
  app.use('/api/join-link', joinLinkLimiter, joinLinkRoutes);
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
  app.use('/api/support', authenticate, requireEmailVerified, supportRoutes);
  app.use('/api/profile', authenticate, requireEmailVerified, profileRoutes);

  // Feed ICS del calendario famiglia: PUBBLICO (nessun JWT), protetto da token
  // segreto nell'URL. Permette l'iscrizione da Google/Apple Calendar.
  app.use('/calendar-feed', calendarFeedRoutes);

  // Foto ricette generate dall'AI: immagini generiche di piatti (nessun dato
  // personale, cache condivisa per titolo tra famiglie), servite pubblicamente
  // con cache lunga. Montate PRIMA di /uploads autenticato.
  app.use('/uploads/recipe-images', express.static('uploads/recipe-images', { maxAge: '30d', immutable: true }));

  // Foto profilo (avatar): immagini di profilo mostrate ovunque nell'app, senza
  // dati sensibili. Servite pubblicamente (come le foto ricette) per non dover
  // propagare il media-token in ogni Avatar. Montate PRIMA di /uploads autenticato.
  app.use('/uploads/avatars', express.static('uploads/avatars', { maxAge: '7d' }));

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
