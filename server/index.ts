import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "node:url";
import { config } from './lib/config';
import { logger, generateRequestId } from './lib/logger';
import { seedOwnerEntitlements } from './lib/entitlements';
import { ensureDemoAccount } from './lib/demo-account';
import { ensureTesterAccounts } from './lib/tester-accounts';
import { ensureVipAccount } from './lib/vip-account';
import { ensurePantryUniqueIndex } from './lib/ensure-pantry-schema';
import { ensureClientCrashSchema } from './lib/ensure-client-crash-schema';
import { ensureMealPlanLatencyAlertSchema } from './lib/ensure-meal-plan-latency-alert-schema';
import { startBillReminderScheduler } from './lib/bill-reminders';
import { startEventReminderScheduler } from './lib/event-reminders';
import { startUploadIntegrityScheduler } from './lib/upload-integrity';
import { startMealPlanBalanceScheduler } from './lib/meal-plan-balance-monitor';
import { startMealPlanAllergenMonitorScheduler } from './lib/meal-plan-allergen-monitor';
import { startGcalReconcileScheduler } from './lib/google-calendar-sync';
import { checkWebBuildStaleness, type WebBuildStaleness } from './lib/web-build-staleness';

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

// Inoltra la richiesta di manifest nativo al dev server Metro (solo sviluppo).
// Se Metro non risponde, si torna al manifest statico (comportamento storico).
async function proxyExpoDevManifest(platform: string, req: Request, res: Response) {
  try {
    const upstream = await fetch("http://127.0.0.1:8082/", {
      headers: {
        "expo-platform": platform,
        accept: req.header("accept") ?? "application/expo+json,application/json",
        "expo-protocol-version": req.header("expo-protocol-version") ?? "1",
        "expo-api-version": req.header("expo-api-version") ?? "1",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) throw new Error(`Metro manifest ${upstream.status}`);
    const body = Buffer.from(await upstream.arrayBuffer());
    for (const h of ["content-type", "expo-protocol-version", "expo-sfv-version"]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    return res.status(upstream.status).send(body);
  } catch {
    return serveExpoManifest(platform, res);
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

interface RouteMeta {
  title: string;
  description: string;
}

const RESET_PASSWORD_META: RouteMeta = {
  title: "Reimposta Password – FamilySync",
  description: "Crea una nuova password sicura per il tuo account FamilySync.",
};
const SOCIAL_IMAGE = "https://familysync.eu/og-image.png";
const SOCIAL_IMAGE_PATH = path.resolve(process.cwd(), "assets/images/og-image.png");
const SOCIAL_IMAGE_WIDTH = 1200;
const SOCIAL_IMAGE_HEIGHT = 630;

const PUBLIC_ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "FamilySync – App di Coordinamento Familiare",
    description:
      "FamilySync aiuta la tua famiglia a coordinare calendario, liste della spesa, faccende, bollette e chat in tempo reale. Gratuito e sicuro.",
  },
  "/welcome": {
    title: "Benvenuto su FamilySync – Coordina la tua Famiglia",
    description:
      "Organizza la vita familiare con FamilySync: calendario condiviso, liste della spesa, faccende con punti, bollette e chat di gruppo. Inizia gratis.",
  },
  "/login": {
    title: "Accedi o Registrati – FamilySync",
    description:
      "Accedi al tuo account FamilySync o registrati gratuitamente per iniziare a coordinare la tua famiglia.",
  },
  "/forgot-password": {
    title: "Recupera Password – FamilySync",
    description:
      "Hai dimenticato la password FamilySync? Inserisci la tua email per ricevere le istruzioni di recupero accesso.",
  },
};

function resolvePublicMeta(routePath: string): RouteMeta | undefined {
  const meta = PUBLIC_ROUTE_META[routePath];
  if (meta) return meta;
  if (routePath.startsWith("/reset-password/")) return RESET_PASSWORD_META;
  return undefined;
}

function isNoindexRoute(routePath: string): boolean {
  return (
    ["/login", "/forgot-password", "/register"].includes(routePath) ||
    routePath.startsWith("/reset-password/") ||
    routePath.startsWith("/join/")
  );
}

function buildSeoTags(meta: RouteMeta, canonical: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return [
    `<title>${meta.title}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:site_name" content="FamilySync">`,
    `<meta property="og:locale" content="it_IT">`,
    `<meta property="og:image" content="${SOCIAL_IMAGE}">`,
     `<meta property="og:image:width" content="${SOCIAL_IMAGE_WIDTH}">`,
     `<meta property="og:image:height" content="${SOCIAL_IMAGE_HEIGHT}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${SOCIAL_IMAGE}">`,
  ].join("\n    ");
}

function injectRouteMeta(
  html: string,
  meta: RouteMeta,
  canonical: string
): string {
  const tags = buildSeoTags(meta, canonical);
  // Replace the generic <title> tag emitted by the Expo SPA shell.
  return html.replace(/<title\b[^>]*>[^<]*<\/title>/i, tags);
}

export function computeWebBuildVersion(indexHtml: string): string {
  const bundlePaths = indexHtml.match(/\/_expo\/static\/js\/[^"' >]+\.js/g) ?? [];
  if (bundlePaths.length === 0) return "";
  const canonical = Array.from(new Set(bundlePaths)).sort().join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function resolveStaticRouteFile(webBuildDir: string, requestPath: string): string | null {
  const segments = requestPath.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  let currentDir = webBuildDir;
  try {
    for (let index = 0; index < segments.length - 1; index++) {
      const exactDir = path.join(currentDir, segments[index]);
      if (!fs.existsSync(exactDir) || !fs.statSync(exactDir).isDirectory()) {
        return null;
      }
      currentDir = exactDir;
    }

    const leaf = segments.at(-1)!;
    const exactCandidates = [
      path.join(currentDir, `${leaf}.html`),
      path.join(currentDir, leaf, "index.html"),
    ];
    const exact = exactCandidates.find((candidate) => fs.existsSync(candidate));
    if (exact) {
      return exact;
    }

    const dynamicLeaf = fs
      .readdirSync(currentDir)
      .find((entry) => /^\[[^/]+\]\.html$/.test(entry));
    return dynamicLeaf ? path.join(currentDir, dynamicLeaf) : null;
  } catch {
    return null;
  }
}

export function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  const webBuildDir = path.resolve(process.cwd(), "web-build");
  const webIndexPath = path.join(webBuildDir, "index.html");
  const hasWebBuild = fs.existsSync(webIndexPath);
  const isStaticBuild =
    fs.existsSync(path.join(webBuildDir, "welcome", "index.html")) ||
    fs.existsSync(path.join(webBuildDir, "welcome.html"));

  // Versione della build web corrente: derivata dai percorsi (con hash nel
  // nome) dei bundle JS referenziati da index.html. Il client web calcola lo
  // STESSO valore leggendo i propri tag <script> a runtime, quindi il
  // confronto funziona anche se l'app aperta è già una build vecchia.
  // Calcolata una volta all'avvio: dopo un Republish il processo riparte.
  let buildVersion = "";
  if (hasWebBuild) {
    try {
      const indexHtml = fs.readFileSync(path.join(webBuildDir, "index.html"), "utf-8");
      buildVersion = computeWebBuildVersion(indexHtml);
      if (!buildVersion) {
        logger.warn("No _expo bundle references found in web-build/index.html; /build-version disabled");
      }
    } catch (err) {
      logger.warn(`Unable to compute web build version: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Endpoint leggerissimo (fuori da /api: niente auth né rate limiter) usato
  // dall'app web per accorgersi che il server ha una build più recente.
  // Controllo staleness: la build statica in web-build/ resta indietro dopo
  // le modifiche frontend (vedi .agents/memory/expo-static-web-build.md).
  // Calcolato all'avvio, loggato subito e riesposto in /build-version.
  let staleness: WebBuildStaleness | null = null;
  // In produzione (deploy) non c'è git e la build è per definizione quella
  // pubblicata: il controllo non ha senso e non deve MAI segnalare "stale".
  const isProductionDeploy =
    process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
  if (!isProductionDeploy) {
    void checkWebBuildStaleness()
      .then((result) => {
        staleness = result;
        if (result.status === "stale") {
          logger.warn(`[web-build staleness] ${result.message}`);
        } else {
          log(`[web-build staleness] ${result.message}`);
        }
      })
      .catch((err) => {
        log(`[web-build staleness] check failed: ${String(err)}`);
      });
  } else {
    staleness = {
      status: "unknown",
      webBuildMtime: null,
      lastFrontendCommit: null,
      message: "controllo staleness disattivato in produzione",
    };
  }

  app.get("/build-version", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (!buildVersion) {
      return res.status(404).json({ error: "NO_WEB_BUILD" });
    }
    res.json({
      version: buildVersion,
      staleness: staleness
        ? {
            status: staleness.status,
            webBuildMtime: staleness.webBuildMtime,
            lastFrontendCommit: staleness.lastFrontendCommit,
            note: staleness.message,
          }
        : { status: "unknown", note: "controllo staleness non ancora completato" },
    });
  });

  // Alias di compatibilità: i bundle web GIÀ distribuiti (vecchio UpdateBanner)
  // interrogano /api/version; deve restituire la stessa versione.
  app.get("/api/version", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ version: buildVersion || "unknown" });
  });

  // L'immagine usata dai meta tag social deve restare raggiungibile senza
  // autenticazione. Un handler esplicito evita che la SPA intercetti l'URL
  // mancante restituendo HTML con status 200, che produce anteprime senza foto.
  app.get("/og-image.png", (_req: Request, res: Response) => {
    if (!fs.existsSync(SOCIAL_IMAGE_PATH)) {
      return res
        .status(404)
        .type("text/plain")
        .send("Social preview image is not available");
    }
    return res.sendFile(SOCIAL_IMAGE_PATH);
  });

  log(
    hasWebBuild
      ? `Serving Expo web app from web-build (${isStaticBuild ? "static" : "single"} output) with native manifest routing`
      : "Serving static Expo files with dynamic manifest routing",
  );

  // Anche le build statiche mantengono index.html come shell affidabile per
  // le route pubbliche dinamiche (login, reset ecc.). Lo usiamo sempre come
  // base per iniettare i metadati prima che express.static risponda.
  const baseHtml = hasWebBuild
    ? fs.readFileSync(webIndexPath, "utf-8")
    : "";
  const getStaticRouteHtml = (routePath: string): string => {
    if (!isStaticBuild || routePath === "/") {
      return baseHtml;
    }
    const routeFile = resolveStaticRouteFile(webBuildDir, routePath);
    return routeFile ? fs.readFileSync(routeFile, "utf-8") : baseHtml;
  };
  const baseUrl = (process.env.CLIENT_URL || "https://familysync.eu").replace(
    /\/$/,
    ""
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.method === "GET" && isNoindexRoute(req.path)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

    if (req.path === "/" || req.path === "/manifest") {
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") {
        // In sviluppo il QR "Try on device" di Replit punta a QUESTO server
        // (porta esterna 80), non a Metro: senza inoltro Expo Go riceve 404
        // e mostra "Failed to download remote update". Inoltriamo il manifest
        // a Metro (porta 8082 dietro il tunnel), che risponde con gli URL del
        // tunnel: il telefono scarica poi il bundle direttamente da lì.
        if (process.env.NODE_ENV === "development") {
          return proxyExpoDevManifest(platform, req, res);
        }
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

    if (!hasWebBuild) {
      return next();
    }

    // Intercept HTML browser requests for known public routes BEFORE
    // express.static serves the generic index.html.  This ensures the
    // initial HTML response carries per-route title/description/OG tags
    // even when express.static would otherwise short-circuit the fallback.
    if (req.method === "GET" && req.accepts("html")) {
      const routePath = req.path === "/" ? "/" : req.path.replace(/\/$/, "");
      const canonical = `${baseUrl}${routePath}`;
      if (routePath === "/" || routePath === "/welcome") {
        const meta = PUBLIC_ROUTE_META[routePath] ?? PUBLIC_ROUTE_META["/welcome"];
        const html = injectRouteMeta(getStaticRouteHtml(routePath), meta, canonical);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.send(html);
      }
      const meta = resolvePublicMeta(routePath);
      if (meta) {
        const html = injectRouteMeta(getStaticRouteHtml(routePath), meta, canonical);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        return res.send(html);
      }
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
    // Un browser può avere ancora in memoria una shell HTML di una build
    // precedente e chiedere quindi un entry bundle hashato che non esiste più
    // sul server. Restituire l'HTML 404 con MIME JavaScript causa il crash
    // dell'artifact; riallineiamo solo i vecchi entry bundle al file corrente.
    const currentEntryMatch = baseHtml.match(
      /\/_expo\/static\/js\/web\/(entry-[a-z0-9]+\.js)/i,
    );
    const currentEntryFile = currentEntryMatch?.[1];
    if (currentEntryFile) {
      app.use("/_expo/static/js/web", (req: Request, res: Response, next: NextFunction) => {
        if (req.method !== "GET") {
          return next();
        }
        const requestedEntry = path.basename(req.path);
        if (
          requestedEntry === currentEntryFile ||
          !/^entry-[a-z0-9]+\.js$/i.test(requestedEntry)
        ) {
          return next();
        }
        res.setHeader("Cache-Control", "no-store");
        return res.sendFile(
          path.join(webBuildDir, "_expo", "static", "js", "web", currentEntryFile),
        );
      });
    }

    // index.html (e sw.js) NON devono restare in cache sul telefono, altrimenti
    // dopo una pubblicazione l'utente continua a vedere il bundle vecchio.
    // I bundle JS in _expo/ hanno hash nel nome: cache lunga e sicura.
    app.use(
      express.static(webBuildDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
          } else if (filePath.includes(`${path.sep}_expo${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupWebAppFallback(app: express.Application) {
  // Governance files are useful even when the Expo web build is unavailable.
  app.use(express.static(path.resolve(process.cwd(), "public")));

  const webIndexPath = path.resolve(process.cwd(), "web-build", "index.html");
  if (!fs.existsSync(webIndexPath)) {
    return;
  }
  const isStaticBuild =
    fs.existsSync(path.join(path.dirname(webIndexPath), "welcome", "index.html")) ||
    fs.existsSync(path.join(path.dirname(webIndexPath), "welcome.html"));
  const webBuildDir = path.dirname(webIndexPath);

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
    if (isNoindexRoute(req.path)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    if (isStaticBuild) {
      const dynamicRouteFile = resolveStaticRouteFile(webBuildDir, req.path);
      if (dynamicRouteFile) {
        res.setHeader("Cache-Control", "no-cache, must-revalidate");
        return res.sendFile(dynamicRouteFile);
      }
      return next();
    }
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
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

export async function startServer() {
  await initStripe();
  
  setupCors(app);
  setupStripeWebhook(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupWebAppFallback(app);

  setupErrorHandler(app);

  // Indice univoco dispensa PRIMA di accettare richieste: drizzle push non
  // sa creare indici a espressione, quindi lo garantiamo qui (dev e prod).
  // Senza indice l'upsert ON CONFLICT di addToPantry fallisce, quindi in
  // produzione un errore qui deve bloccare l'avvio (fail-fast, mai degradato).
  try {
    const r = await ensurePantryUniqueIndex();
    if (r.created) log('pantry unique index created (was missing)');
  } catch (err) {
    log(`pantry unique index ensure failed: ${String(err)}`);
    if (process.env.NODE_ENV === 'production') throw err;
  }

  // Tabella client_crash_reports (migrazione 0028) PRIMA di accettare
  // richieste: il DB di produzione è separato e senza tabella ogni report
  // crash perde la persistenza (l'alert email non scatta mai). Best-effort:
  // l'endpoint /api/client-errors è già fail-open, quindi qui NON blocchiamo
  // l'avvio in caso di errore (a differenza dell'indice dispensa).
  try {
    const r = await ensureClientCrashSchema();
    if (r.created) log('client_crash_reports table created (was missing)');
  } catch (err) {
    log(`client crash schema ensure failed: ${String(err)}`);
  }

  // Stato condiviso del monitor di latenza piani (migrazione 0030) PRIMA di
  // accettare richieste: senza tabella non possiamo deduplicare gli avvisi tra
  // istanze, quindi in produzione un bootstrap fallito deve fermare l'avvio
  // anziché lasciare l'alert silenziosamente inattivo.
  try {
    const r = await ensureMealPlanLatencyAlertSchema();
    if (r.created) log('meal_plan_latency_alert_state table created (was missing)');
  } catch (err) {
    log(`meal plan latency alert schema ensure failed: ${String(err)}`);
    if (process.env.NODE_ENV === 'production') throw err;
  }

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
      // Garantisce l'account VIP (accesso completo permanente). Attivo solo
      // dove VIP_ACCOUNT_EMAIL è impostata (es. produzione).
      void ensureVipAccount()
        .then((r) => {
          if (r.created) log(`vip account created (${r.email})`);
          else if (r.upgraded) log(`vip account upgraded to permanent premium (${r.email})`);
          else if (r.skipped && r.reason === "missing_password")
            log(`vip account skipped: set VIP_ACCOUNT_PASSWORD to enable`);
        })
        .catch((err) => log(`vip account seed failed: ${String(err)}`));
      // Promemoria bollette lato server (email + push, dedup su DB).
      startBillReminderScheduler();
      // Promemoria eventi calendario lato server (email + push, dedup su DB).
      startEventReminderScheduler();
      // Scansione giornaliera integrità allegati (rileva file_url/avatar_url orfani).
      startUploadIntegrityScheduler();
      // Valutazione settimanale equilibrio piani mediterranei AI reali
      // (opt-in via MEAL_PLAN_BALANCE_MONITOR=true: consuma quota AI).
      startMealPlanBalanceScheduler();
      // Sentinella settimanale con allergene sintetico: rileva regressioni
      // confermate del modello (opt-in via MEAL_PLAN_ALLERGEN_MONITOR=true).
      startMealPlanAllergenMonitorScheduler();
      // Riconciliazione Google Calendar: recupera gli eventi non sincronizzati
      // dopo errori temporanei (backfill periodico, dedup su mapping unique).
      startGcalReconcileScheduler();
    },
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void startServer();
}
