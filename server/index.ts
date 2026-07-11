import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { config } from './lib/config';
import { logger, generateRequestId } from './lib/logger';
import { seedOwnerEntitlements } from './lib/entitlements';
import { ensureDemoAccount } from './lib/demo-account';
import { ensureTesterAccounts } from './lib/tester-accounts';

const app = express();
app.set("trust proxy", 1);
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  if (!config.premiumPaymentsEnabled) {
    logger.info('Premium payments disabled (set PREMIUM_PAYMENTS_ENABLED=true to enable)');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    logger.warn('DATABASE_URL not found, skipping Stripe initialization');
    return;
  }

  try {
    const { runMigrations } = await import('stripe-replit-sync');
    const { getStripeSync } = await import('./lib/stripeClient');
    const { WebhookHandlers } = await import('./lib/webhookHandlers');

    logger.info('Initializing Stripe schema...');
    await runMigrations({ 
      databaseUrl,
    });
    logger.info('Stripe schema ready');

    const stripeSync = await getStripeSync();

    logger.info('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result?.webhook) {
        logger.info(`Webhook configured: ${result.webhook.url}`);
      } else {
        logger.info('Webhook setup completed');
      }
    } catch (webhookError) {
      logger.warn('Webhook setup skipped (sandbox mode or not configured)');
    }

    logger.info('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => {
        logger.info('Stripe data synced');
      })
      .catch((err: any) => {
        logger.error('Error syncing Stripe data', { error: String(err) });
      });
  } catch (error) {
    logger.error('Failed to initialize Stripe', { error: String(error) });
  }
}

function setupStripeWebhook(app: express.Application) {
  if (!config.premiumPaymentsEnabled) return;

  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }

      try {
        const { WebhookHandlers } = await import('./lib/webhookHandlers');
        const sig = Array.isArray(signature) ? signature[0] : signature;

        if (!Buffer.isBuffer(req.body)) {
          logger.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        await WebhookHandlers.processWebhook(req.body as Buffer, sig);

        res.status(200).json({ received: true });
      } catch (error: any) {
        logger.error('Webhook error', { error: error.message });
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    const isMobileApp = !origin;

    if (isMobileApp) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    } else if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const requestId = generateRequestId();
    (req as any).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    const start = Date.now();
    const reqPath = req.path;

    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;

      const duration = Date.now() - start;
      logger.info(`${req.method} ${reqPath} ${res.statusCode}`, {
        requestId,
        durationMs: duration,
      });
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  const webBuildDir = path.resolve(process.cwd(), "web-build");
  const hasWebBuild = fs.existsSync(path.join(webBuildDir, "index.html"));

  log(
    hasWebBuild
      ? "Serving Expo web app from web-build with native manifest routing"
      : "Serving static Expo files with dynamic manifest routing",
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path === "/" || req.path === "/manifest") {
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") {
        return serveExpoManifest(platform, res);
      }
    }

    if (!hasWebBuild && req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.get("/download/store-assets.zip", (_req: Request, res: Response) => {
    const zipPath = path.resolve(process.cwd(), "store-assets.zip");
    if (fs.existsSync(zipPath)) {
      res.setHeader("Content-Disposition", "attachment; filename=store-assets.zip");
      res.setHeader("Content-Type", "application/zip");
      res.sendFile(zipPath);
    } else {
      res.status(404).send("File not found");
    }
  });

  if (hasWebBuild) {
    app.use(express.static(webBuildDir));
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupWebAppFallback(app: express.Application) {
  const webIndexPath = path.resolve(process.cwd(), "web-build", "index.html");
  if (!fs.existsSync(webIndexPath)) {
    return;
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") {
      return next();
    }
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    // Only serve the SPA shell for browser navigations (HTML requests).
    // Missing assets/endpoints fall through to a real 404 instead of index.html.
    if (!req.accepts("html")) {
      return next();
    }
    res.sendFile(webIndexPath);
  });
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  await initStripe();
  
  setupCors(app);
  setupStripeWebhook(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupWebAppFallback(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
      void seedOwnerEntitlements()
        .then((n) => {
          if (n > 0) log(`owner premium reconciled for ${n} family(ies)`);
        })
        .catch((err) => log(`owner premium seed failed: ${String(err)}`));
      // Garantisce l'account demo per i revisori store (crea solo se manca).
      // Funziona anche nel DB di produzione dopo il deploy.
      void ensureDemoAccount()
        .then((r) => {
          if (r.created) log(`demo account created (${r.email})`);
          else if (r.skipped && r.reason === "missing_password")
            log(`demo account skipped: set DEMO_ACCOUNT_PASSWORD to enable`);
        })
        .catch((err) => log(`demo account seed failed: ${String(err)}`));
      // Garantisce i 15 account tester (prova 15 giorni). Crea solo i mancanti.
      // Funziona anche nel DB di produzione dopo il deploy.
      void ensureTesterAccounts()
        .then((r) => {
          if (r.created > 0) log(`tester accounts created: ${r.created}`);
          else if (r.skipped && r.reason === "missing_secret")
            log(`tester accounts skipped: SESSION_SECRET non impostato`);
        })
        .catch((err) => log(`tester accounts seed failed: ${String(err)}`));
    },
  );
})();
