import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "node:http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { setupWebSocket } from "./lib/websocket";
import { authenticate, authenticateMedia, requireEmailVerified } from "./middleware/auth";
import { createUploadsObjectHandler } from "./lib/upload-storage";

import authRoutes from "./routes/auth";
import familiesRoutes from "./routes/families";
import invitesRoutes, { inviteLimiter } from "./routes/invites";
import joinLinkRoutes, { joinLinkLimiter } from "./routes/join-link";
import calendarRoutes from "./routes/calendar";
import calendarFeedRoutes from "./routes/calendar-feed";
import googleCalendarSyncRoutes from "./routes/google-calendar-sync";
import shoppingRoutes from "./routes/shopping";
import choresRoutes from "./routes/chores";
import rewardsRoutes from "./routes/rewards";
import pantryRoutes from "./routes/pantry";
import expensesRoutes from "./routes/expenses";
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
import { testAnalyticsEventsRouter, testAnalyticsAdminRouter, requireTestAnalyticsFlag } from "./routes/test-analytics";
import { feedbackRouter, feedbackAdminRouter } from "./routes/feedback";

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(helmet({
    // CSP come difesa in profondità per la web app Expo servita da questo server.
    // Bundle JS content-hashed => script-src 'self' basta; niente inline script.
    // 'unsafe-inline' solo per gli style (React Native Web inietta stili inline).
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "wss:", "https://api.revenuecat.com"],
        mediaSrc: ["'self'", "blob:"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
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

  app.get('/api/health', (_req, res) => {
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
  // Google Calendar sync: auth applicata per-rotta (il callback OAuth è pubblico).
  app.use('/api/calendar-sync', googleCalendarSyncRoutes);
  app.use('/api/shopping', authenticate, requireEmailVerified, shoppingRoutes);
  app.use('/api/chores', authenticate, requireEmailVerified, choresRoutes);
  app.use('/api/rewards', authenticate, requireEmailVerified, rewardsRoutes);
  app.use('/api/pantry', authenticate, requireEmailVerified, pantryRoutes);
  app.use('/api/expenses', authenticate, requireEmailVerified, expensesRoutes);
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
  // Analytics interna TEMPORANEA (periodo di test): attiva solo con
  // ENABLE_TEST_ANALYTICS=true; pannello riservato a APP_OWNER_EMAILS.
  // Il check del flag PRIMA di authenticate: con flag off gli endpoint
  // rispondono sempre 404 (non esposti), anche a richieste non autenticate.
  app.use('/api/test-analytics', requireTestAnalyticsFlag, authenticate, testAnalyticsEventsRouter);
  app.use('/api/admin/test-analytics', requireTestAnalyticsFlag, authenticate, testAnalyticsAdminRouter);

  // Feedback tester ("Dacci il tuo parere"): invio per tutti gli utenti
  // verificati, consultazione riservata al proprietario (APP_OWNER_EMAILS).
  app.use('/api/feedback', authenticate, requireEmailVerified, feedbackRouter);
  app.use('/api/admin/feedback', authenticate, feedbackAdminRouter);

  // Feed ICS del calendario famiglia: PUBBLICO (nessun JWT), protetto da token
  // segreto nell'URL. Permette l'iscrizione da Google/Apple Calendar.
  app.use('/calendar-feed', calendarFeedRoutes);

  // Foto ricette generate dall'AI: immagini generiche di piatti (nessun dato
  // personale, cache condivisa per titolo tra famiglie), servite pubblicamente
  // con cache lunga. Montate PRIMA di /uploads autenticato.
  // In modalità STORAGE_MODE=object-storage servite dal bucket (persistente su
  // autoscale); express.static resta come fallback per file legacy su disco.
  // Le foto pubbliche (ricette/avatar) devono essere caricabili anche da pagine
  // su un'altra origine (es. anteprima di sviluppo Metro): helmet imposta
  // Cross-Origin-Resource-Policy: same-origin di default, che fa fallire il
  // caricamento delle <img> cross-origin nel browser. Le rilassiamo SOLO qui.
  const allowCrossOriginImages = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  };

  app.use(
    '/uploads/recipe-images',
    allowCrossOriginImages,
    createUploadsObjectHandler('/uploads/recipe-images', { cacheControl: 'public, max-age=2592000, immutable' }),
    express.static('uploads/recipe-images', { maxAge: '30d', immutable: true })
  );

  // Foto profilo (avatar): immagini di profilo mostrate ovunque nell'app, senza
  // dati sensibili. Servite pubblicamente (come le foto ricette) per non dover
  // propagare il media-token in ogni Avatar. Montate PRIMA di /uploads autenticato.
  // In modalità STORAGE_MODE=object-storage i file /uploads vengono serviti dal
  // bucket Replit Object Storage (persistente su autoscale); express.static resta
  // come fallback per eventuali file legacy ancora su disco locale.
  app.use('/uploads/avatars', allowCrossOriginImages, createUploadsObjectHandler('/uploads/avatars'), express.static('uploads/avatars', { maxAge: '7d' }));

  app.use('/uploads', authenticateMedia, requireEmailVerified, createUploadsObjectHandler('/uploads'), express.static('uploads'));

  app.use('/legal', legalRoutes);
  app.use('/privacy', (req, res, next) => { req.url = '/privacy'; legalRoutes(req, res, next); });
  app.use('/terms', (req, res, next) => { req.url = '/terms'; legalRoutes(req, res, next); });
  app.use('/help', helpRoutes);

  const httpServer = createServer(app);

  const io = setupWebSocket(httpServer);
  app.set('io', io);

  return httpServer;
}
