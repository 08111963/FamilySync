import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { scheduleAuthTokenCleanup } from '../lib/auth-token-cleanup';
import { users, emailVerificationTokens, passwordResetTokens, socialSignupTokens, oauthCallbackResults } from '../../shared/schema';
import { eq, and, isNull, gt, lt, sql } from 'drizzle-orm';
import nodeCrypto from 'crypto';
import { PRIVACY_POLICY_VERSION } from '../../shared/policy-version';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateMediaToken } from '../lib/jwt';
import { resolveUploadFileAccess, userIsFamilyMember } from '../lib/media-auth';
import { sendVerificationEmail, sendPasswordResetEmail, isPasswordResetEmailConfigured, isVerificationEmailConfigured } from '../lib/email';
import { authenticate, requireEmailVerified, blockChildAccount } from '../middleware/auth';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { config } from '../lib/config';
import { generateResetToken, hashResetToken } from '../lib/reset-token';
import { deleteUserAccount } from '../lib/account-deletion';
import { activatePendingTrialsForUser } from '../lib/entitlements';
import { recordConsent } from '../lib/consents';
import { safeReturnTo } from '../../lib/safe-return-to';
import {
  isGoogleLoginConfigured,
  isAllowedReturnUrl,
  getGoogleRedirectUri,
  signOauthState,
  verifyOauthState,
  signLoginCode,
  verifyLoginCode,
  exchangeGoogleCode,
  verifyAppleIdentityToken,
  type OauthProfile,
} from '../lib/oauth';

const router = Router();

/**
 * Rate limiter dedicato ai flussi di password reset: protegge da brute force ed
 * enumeration. Disattivato in ambiente di test per non interferire con la suite.
 */
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter per l'eliminazione account: protegge da tentativi ripetuti sulla
 * password (brute force). Disattivato in test come per il password reset.
 */
const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter DEDICATO al login, con chiave sull'email (non solo sull'IP):
 * blocca il password spraying mirato a un singolo account anche quando il
 * limite globale /api lascerebbe budget sufficiente. Disattivato in test.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || req.ip || 'unknown';
  },
  validate: { keyGeneratorIpFallback: false },
  message: { error: { code: "RATE_LIMITED", message: "Troppi tentativi di accesso. Riprova tra 15 minuti." } },
});

const emailSchema = z.string().trim().toLowerCase().email("Email non valida");

const strongPasswordSchema = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri")
  .regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola")
  .regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola")
  .regex(/[0-9]/, "La password deve contenere almeno un numero");

const signupSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  name: z.string().min(1, "Il nome è obbligatorio").max(100),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Devi accettare i Termini d'Uso" }) }),
  // Fascia d'età dichiarata (minimizzazione: niente data di nascita completa).
  // 'under14' viene rifiutata: sotto i 14 anni il profilo deve essere creato
  // e gestito da un genitore/tutore (vedi Privacy Policy §minori).
  // OBBLIGATORIA per ogni nuovo account: nessun default "adulto".
  ageBand: z.enum(["under14", "14_17", "adult"], {
    errorMap: () => ({ message: "La fascia d'età è obbligatoria" }),
  }),
  returnTo: z.string().max(2048).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La password è obbligatoria"),
});

const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, "Token obbligatorio"),
  newPassword: strongPasswordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "La password attuale è obbligatoria"),
  newPassword: strongPasswordSchema,
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, "La password attuale è obbligatoria"),
  confirmation: z.string().min(1, "Conferma richiesta"),
});

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { email, password, name, ageBand } = parsed.data;
    const returnTo = parsed.data.returnTo
      ? safeReturnTo(parsed.data.returnTo)
      : undefined;
    if (parsed.data.returnTo && !returnTo) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Destinazione non valida" },
      });
    }

    if (ageBand === "under14") {
      return res.status(403).json({
        error: {
          code: "UNDER_AGE",
          message: "Sotto i 14 anni non è possibile creare un account autonomamente: chiedi a un genitore o tutore di creare e gestire il profilo per te.",
        },
      });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: { code: "EMAIL_EXISTS", message: "Email già registrata" } });
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      name,
      emailVerified: false,
      termsAcceptedAt: new Date(),
      privacyPolicySeenVersion: PRIVACY_POLICY_VERSION,
      ageBand,
      aiFeaturesEnabled: true,
      aiHealthConsent: true,
    }).returning();

    // Registro append-only dell'accettazione dei Termini.
    await recordConsent(newUser.id, "terms", true);
    
    // Pulizia opportunistica (throttled, non bloccante) dei token scaduti.
    scheduleAuthTokenCleanup();

    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    
    await db.insert(emailVerificationTokens).values({
      userId: newUser.id,
      token: verificationToken,
      expiresAt,
    });
    
    // In produzione l'email di verifica contiene un link basato su CLIENT_URL:
    // se l'invio reale non è possibile (manca Resend o CLIENT_URL) logghiamo e
    // continuiamo, ma NON inviamo un link rotto. L'utente potrà richiedere un
    // nuovo invio quando la configurazione sarà corretta.
    if (!config.isProduction || isVerificationEmailConfigured()) {
      await sendVerificationEmail(email, name, verificationToken, returnTo);
    } else {
      logger.warn('Verification email skipped: email service not fully configured', { userId: newUser.id });
    }
    
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    
    res.status(201).json({
      user: { id: newUser.id, email: newUser.email, name: newUser.name, emailVerified: false },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Signup error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la registrazione" } });
  }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { email, password } = parsed.data;
    
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Credenziali non valide" } });
    }
    
    if (!user.passwordHash) {
      return res.status(401).json({
        error: { code: "SOCIAL_LOGIN_ONLY", message: "Questo account usa l'accesso con Google o Apple: usa il pulsante dedicato." },
      });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Credenziali non valide" } });
    }

    // Prova gratuita a tempo (account tester): al PRIMO login parte il conteggio
    // dei 15 giorni di accesso Premium. Idempotente e fail-safe (non blocca il login).
    await activatePendingTrialsForUser(user.id);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        ageBand: user.ageBand,
        needsOnboarding: !user.ageBand || !user.termsAcceptedAt,
        // Avviso non bloccante: la Privacy Policy è cambiata rispetto all'ultima
        // versione vista (stessi campi di GET /me, così il banner appare subito).
        privacyPolicyUpdated: user.privacyPolicySeenVersion !== PRIVACY_POLICY_VERSION,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Login error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il login" } });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: { code: "MISSING_TOKEN", message: "Refresh token richiesto" } });
    }
    
    const payload = verifyRefreshToken(refreshToken);
    
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }

    // Revoca sessioni: un refresh token emesso PRIMA di un cambio/reset password
    // porta una tokenVersion vecchia e viene rifiutato. I token storici senza
    // claim valgono come versione 0.
    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Sessione revocata: accedi di nuovo" } });
    }

    const newAccessToken = generateAccessToken(user);
    
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token non valido" } });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      ageBand: user.ageBand,
      // true per gli account "dispositivo bambino" (accesso con codice PIN):
      // il client mostra la vista ridotta; il server blocca comunque le aree vietate.
      isChildAccount: user.isChildAccount === true,
      // Onboarding richiesto per account creati prima delle nuove regole:
      // fascia d'età mancante o Termini mai accettati esplicitamente.
      needsOnboarding: !user.ageBand || !user.termsAcceptedAt,
      // Avviso non bloccante: la Privacy Policy è cambiata rispetto all'ultima
      // versione vista dall'utente (informativa, NON un nuovo consenso).
      privacyPolicyUpdated: user.privacyPolicySeenVersion !== PRIVACY_POLICY_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    });
  } catch (error) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero utente" } });
  }
});

/**
 * Presa visione dell'avviso "Privacy Policy aggiornata": salva la versione
 * corrente come vista, così il banner in-app non viene più mostrato.
 * È un'informativa (non un consenso): nessuna registrazione nel registro consensi.
 */
router.post('/privacy-policy-ack', authenticate, blockChildAccount, async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .update(users)
      .set({ privacyPolicySeenVersion: PRIVACY_POLICY_VERSION, updatedAt: new Date() })
      .where(eq(users.id, req.user!.userId))
      .returning({ id: users.id });
    if (!row) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Utente non trovato' } });
    }
    res.json({ ok: true, privacyPolicySeenVersion: PRIVACY_POLICY_VERSION });
  } catch (error) {
    logger.error('Privacy policy ack error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore durante il salvataggio della presa visione' } });
  }
});

const onboardingSchema = z.object({
  ageBand: z.enum(['under14', '14_17', 'adult'], {
    errorMap: () => ({ message: "La fascia d'età è obbligatoria" }),
  }),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Devi accettare i Termini d'Uso" }) }),
});

/**
 * Onboarding per account ESISTENTI creati prima delle nuove regole (fascia
 * d'età obbligatoria, accettazione esplicita dei Termini). Non tocca nessun
 * altro dato dell'utente: nessuna perdita di famiglie, liste o contenuti.
 */
router.post('/onboarding', authenticate, blockChildAccount, async (req: Request, res: Response) => {
  try {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Dati non validi' } });
    }
    const { ageBand } = parsed.data;
    if (ageBand === 'under14') {
      return res.status(403).json({ error: { code: 'AGE_RESTRICTED', message: "Sotto i 14 anni l'account deve essere gestito da un genitore o tutore." } });
    }
    const updated = await db.transaction(async (tx) => {
      const setValues: Record<string, unknown> = {
        ageBand,
        termsAcceptedAt: new Date(),
        privacyPolicySeenVersion: PRIVACY_POLICY_VERSION,
        aiFeaturesEnabled: true,
        aiHealthConsent: true,
        updatedAt: new Date(),
      };
      const [row] = await tx
        .update(users)
        .set(setValues)
        .where(eq(users.id, req.user!.userId))
        .returning({ id: users.id, ageBand: users.ageBand });
      if (!row) throw new Error('USER_NOT_FOUND');
      await recordConsent(req.user!.userId, 'terms', true, tx, { strict: true });
      return row;
    });
    res.json({ ok: true, ageBand: updated.ageBand });
  } catch (error) {
    logger.error('Onboarding error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore durante il completamento del profilo" } });
  }
});

router.post('/change-password', authenticate, blockChildAccount, async (req: Request, res: Response) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { currentPassword, newPassword } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }

    if (!user.passwordHash) {
      return res.status(400).json({
        error: { code: "SOCIAL_LOGIN_ONLY", message: "Questo account usa l'accesso con Google o Apple e non ha una password." },
      });
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: { code: "INVALID_PASSWORD", message: "La password attuale non è corretta" } });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    // Incremento tokenVersion: revoca TUTTI i refresh token emessi prima del
    // cambio password (una sessione rubata non sopravvive al cambio).
    const [updated] = await db.update(users)
      .set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();

    // Nuova coppia di token per la sessione corrente (quella vecchia è revocata).
    res.json({
      message: "Password aggiornata con successo",
      accessToken: generateAccessToken(updated),
      refreshToken: generateRefreshToken(updated),
    });
  } catch (error) {
    logger.error('Change password error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il cambio password" } });
  }
});

router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    const [tokenRecord] = await db.select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .limit(1);
    
    if (!tokenRecord) {
      return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Token non valido" } });
    }
    
    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: { code: "TOKEN_EXPIRED", message: "Token scaduto" } });
    }
    
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, tokenRecord.userId));
    
    await db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token));
    
    res.json({ message: 'Email verificata con successo' });
  } catch (error) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica" } });
  }
});

router.post('/resend-verification-email', authenticate, blockChildAccount, async (req: Request, res: Response) => {
  try {
    const rawReturnTo =
      typeof req.body?.returnTo === 'string' ? req.body.returnTo : undefined;
    const returnTo = rawReturnTo ? safeReturnTo(rawReturnTo) : undefined;
    if (rawReturnTo && !returnTo) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Destinazione non valida" },
      });
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);

    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email già verificata' });
    }

    // Invio esplicito richiesto dall'utente: in produzione serve un servizio email
    // pienamente configurato (Resend + CLIENT_URL) per non inviare link rotti.
    if (config.isProduction && !isVerificationEmailConfigured()) {
      return res.status(503).json({ error: { code: "EMAIL_NOT_CONFIGURED", message: "Servizio email non configurato (Resend e CLIENT_URL richiesti)" } });
    }

    await db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));

    // Pulizia opportunistica (throttled, non bloccante) dei token scaduti.
    scheduleAuthTokenCleanup();

    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      token: verificationToken,
      expiresAt,
    });

    await sendVerificationEmail(user.email, user.name, verificationToken, returnTo);

    res.json({ message: 'Email di verifica inviata' });
  } catch (error) {
    logger.error('Resend verification error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'invio" } });
  }
});

router.post('/media-token', authenticate, requireEmailVerified, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    // Gli account "dispositivo bambino" possono ottenere media token SOLO per
    // le aree loro consentite (es. file chat): gli allegati bollette sono
    // esclusi sia qui che alla verifica del token (claim child, fail-closed).
    const isChild = req.user!.isChildAccount === true;

    const rawFilePath = typeof req.body?.filePath === 'string' ? req.body.filePath.trim() : '';
    let filePath: string | undefined;
    if (rawFilePath.length > 0) {
      const isValid = /^\/?uploads\/[A-Za-z0-9._\-/]+$/.test(rawFilePath) && !rawFilePath.includes('..');
      if (!isValid) {
        return res.status(400).json({ error: { code: "INVALID_FILE_PATH", message: "Percorso file non valido" } });
      }
      filePath = rawFilePath;
    }

    const familyId = typeof req.body?.familyId === 'string' && req.body.familyId.trim().length > 0
      ? req.body.familyId.trim()
      : undefined;

    if (!filePath && !familyId) {
      return res.status(400).json({ error: { code: "MISSING_SCOPE", message: "Specifica filePath o familyId" } });
    }

    if (filePath) {
      const fileFamilyId = await resolveUploadFileAccess(userId, filePath, { excludeBillAttachments: isChild });
      if (!fileFamilyId) {
        return res.status(403).json({ error: { code: "NOT_AUTHORIZED", message: "Non hai i permessi per accedere a questo file" } });
      }
    }

    if (familyId) {
      const isMember = await userIsFamilyMember(userId, familyId);
      if (!isMember) {
        return res.status(403).json({ error: { code: "NOT_AUTHORIZED", message: "Non fai parte di questa famiglia" } });
      }
    }

    const mediaToken = generateMediaToken(userId, { familyId, filePath, child: isChild });

    res.json({ mediaToken, expiresIn: 300 });
  } catch (error) {
    logger.error('Media token error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la generazione del token" } });
  }
});

router.post('/request-password-reset', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = requestPasswordResetSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    // In produzione l'email DEVE poter partire davvero CON un link valido: serve
    // Resend E un CLIENT_URL configurato, altrimenti invieremmo email con link
    // rotto (es. "undefined/reset-password/<token>"). Falliamo in modo esplicito.
    // È un errore di configurazione del server, indipendente dall'esistenza
    // dell'email utente (nessun enumeration).
    if (config.isProduction && !isPasswordResetEmailConfigured()) {
      return res.status(503).json({ error: { code: "EMAIL_NOT_CONFIGURED", message: "Servizio email non configurato (Resend e CLIENT_URL richiesti)" } });
    }

    const { email } = parsed.data;
    // Risposta generica identica in tutti i casi per evitare user enumeration.
    const genericMessage = { message: "Se l'email esiste, riceverai un link" };

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      return res.json(genericMessage);
    }

    // Un solo link valido per utente: rimuovi eventuali token precedenti.
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    // Pulizia opportunistica (throttled, non bloccante) dei token scaduti.
    scheduleAuthTokenCleanup();

    // Salviamo SOLO l'hash; il token in chiaro vive unicamente nel link/email.
    const rawToken = generateResetToken();
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: tokenHash,
      expiresAt,
    });

    // Un fallimento dell'invio email NON deve cambiare la risposta: altrimenti
    // diventerebbe un canale di enumeration (utente esistente → 500, inesistente
    // → 200). Logghiamo l'errore lato server e rispondiamo comunque generico.
    try {
      await sendPasswordResetEmail(email, user.name, rawToken);
    } catch (mailError) {
      logger.error('Password reset email send failed', { error: String(mailError) });
    }

    return res.json(genericMessage);
  } catch (error) {
    logger.error('Request password reset error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la richiesta" } });
  }
});

router.post('/reset-password', passwordResetLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { token, newPassword } = parsed.data;
    const tokenHash = hashResetToken(token);

    // Claim atomico monouso: cancella e recupera la riga in un'unica operazione.
    // Se non esiste (token errato o già usato) → INVALID_TOKEN.
    const [claimed] = await db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, tokenHash))
      .returning();

    if (!claimed) {
      return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o già utilizzato" } });
    }

    if (new Date() > claimed.expiresAt) {
      return res.status(400).json({ error: { code: "TOKEN_EXPIRED", message: "Token scaduto" } });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Anche il reset revoca tutte le sessioni esistenti (tokenVersion + 1):
    // è il percorso tipico DOPO una compromissione dell'account.
    await db.update(users)
      .set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, claimed.userId));

    res.json({ message: 'Password reimpostata con successo' });
  } catch (error) {
    logger.error('Reset password error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il reset" } });
  }
});

// Eliminazione account: accessibile a qualsiasi utente autenticato (anche con
// email non verificata, perche e un diritto fondamentale e richiesto dagli store).
// Gli account "dispositivo bambino" non possono auto-eliminarsi: la revoca
// dell'accesso spetta al genitore (DELETE .../child-access), fail-closed.
router.delete('/account', deleteAccountLimiter, authenticate, blockChildAccount, async (req: Request, res: Response) => {
  try {
    const parsed = deleteAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { password, confirmation } = parsed.data;

    if (confirmation.trim().toUpperCase() !== "ELIMINA") {
      return res.status(400).json({
        error: { code: "INVALID_CONFIRMATION", message: 'Digita "ELIMINA" per confermare' },
      });
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }

    // Account social (senza password): la conferma "ELIMINA" resta obbligatoria,
    // la password viene verificata solo se esiste.
    if (user.passwordHash) {
      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(400).json({ error: { code: "INVALID_PASSWORD", message: "La password attuale non è corretta" } });
      }
    }

    const summary = await deleteUserAccount(user.id);

    res.json({
      message: "Account eliminato con successo",
      familiesDeleted: summary.familiesDeleted,
      membershipsRemoved: summary.membershipsRemoved,
      ownershipTransfers: summary.ownershipTransfers,
      filesDeleted: summary.filesDeleted,
    });
  } catch (error) {
    logger.error('Delete account error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'eliminazione dell'account" } });
  }
});

// ---------------------------------------------------------------------------
// Login social (Google / Apple)
// ---------------------------------------------------------------------------

const socialLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Cerca l'utente ESISTENTE per un login social. L'email arriva verificata dal
 * provider, quindi emailVerified=true. Se l'utente esiste già (anche con
 * password) viene semplicemente autenticato: stessa email = stesso account.
 * Se NON esiste, restituisce null: la creazione avviene SOLO dopo che
 * l'utente ha completato la registrazione (età, presa visione privacy,
 * accettazione Termini) tramite /social/complete — nessun consenso implicito.
 */
async function findSocialUser(profile: OauthProfile) {
  const [existing] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (!existing) return null;
  if (existing.deletedAt) {
    throw Object.assign(new Error('ACCOUNT_DELETED'), { code: 'ACCOUNT_DELETED' });
  }
  // L'email è confermata dal provider: se non era ancora verificata, ora lo è.
  if (!existing.emailVerified) {
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, existing.id));
    existing.emailVerified = true;
  }
  return existing;
}

const SOCIAL_SIGNUP_TTL_MS = 15 * 60 * 1000;

/**
 * Registra un profilo social verificato in attesa di completamento.
 * Nel DB va SOLO l'hash SHA-256 del token; il token in chiaro torna al client.
 */
async function createSocialSignupToken(profile: OauthProfile, provider: 'google' | 'apple'): Promise<string> {
  // Pulizia opportunistica (throttled, non bloccante) dei token scaduti.
  scheduleAuthTokenCleanup();

  const token = nodeCrypto.randomBytes(32).toString('hex');
  const tokenHash = nodeCrypto.createHash('sha256').update(token).digest('hex');
  await db.insert(socialSignupTokens).values({
    tokenHash,
    provider,
    email: profile.email,
    suggestedName: (profile.name || '').slice(0, 100) || null,
    expiresAt: new Date(Date.now() + SOCIAL_SIGNUP_TTL_MS),
  });
  return token;
}

const socialCompleteSchema = z.object({
  signupToken: z.string().min(32).max(200),
  name: z.string().min(1, 'Il nome è obbligatorio').max(100),
  ageBand: z.enum(['under14', '14_17', 'adult'], {
    errorMap: () => ({ message: "La fascia d'età è obbligatoria" }),
  }),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Devi accettare i Termini d'Uso" }) }),
});

/**
 * Completamento della registrazione social: consuma il token monouso in
 * transazione, crea l'account dopo l'accettazione di Policy e Termini e
 * restituisce la sessione. Nessun account viene creato prima di questo punto.
 */
router.post('/social/complete', socialLoginLimiter, async (req: Request, res: Response) => {
  const parsed = socialCompleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Dati non validi' } });
  }
  const { signupToken, name, ageBand } = parsed.data;
  if (ageBand === 'under14') {
    return res.status(403).json({ error: { code: 'AGE_RESTRICTED', message: "Sotto i 14 anni l'account deve essere creato da un genitore o tutore." } });
  }
  const tokenHash = nodeCrypto.createHash('sha256').update(signupToken).digest('hex');
  try {
    const result = await db.transaction(async (tx) => {
      // Consumo monouso: marca usato SOLO se ancora valido e non usato.
      const [pending] = await tx
        .update(socialSignupTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(socialSignupTokens.tokenHash, tokenHash),
          isNull(socialSignupTokens.usedAt),
          gt(socialSignupTokens.expiresAt, new Date()),
        ))
        .returning();
      if (!pending) return null;
      const [existing] = await tx.select().from(users).where(eq(users.email, pending.email)).limit(1);
      if (existing) {
        if (existing.deletedAt) {
          throw Object.assign(new Error('ACCOUNT_DELETED'), { code: 'ACCOUNT_DELETED' });
        }
        return existing;
      }
      const [created] = await tx.insert(users).values({
        email: pending.email,
        passwordHash: null,
        authProvider: pending.provider as 'google' | 'apple',
        name,
        emailVerified: true,
        termsAcceptedAt: new Date(),
        privacyPolicySeenVersion: PRIVACY_POLICY_VERSION,
        ageBand,
        aiFeaturesEnabled: true,
        aiHealthConsent: true,
      }).returning();
      return created;
    });
    if (!result) {
      return res.status(401).json({ error: { code: 'INVALID_SIGNUP_TOKEN', message: 'Registrazione scaduta o già completata. Riprova ad accedere.' } });
    }
    await recordConsent(result.id, 'terms', true);
    await activatePendingTrialsForUser(result.id);
    res.status(201).json(issueSessionResponse(result));
  } catch (error: any) {
    if (error?.code === 'ACCOUNT_DELETED') {
      return res.status(403).json({ error: { code: 'ACCOUNT_DELETED', message: 'Questo account è stato eliminato' } });
    }
    logger.error('Social signup completion error', { error: String(error) });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Errore durante il completamento della registrazione' } });
  }
});

function issueSessionResponse(user: typeof users.$inferSelect) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      ageBand: user.ageBand,
      needsOnboarding: !user.ageBand || !user.termsAcceptedAt,
      // Come POST /login e GET /me: il banner "Privacy Policy aggiornata"
      // deve poter apparire subito anche dopo il login social.
      privacyPolicyUpdated: user.privacyPolicySeenVersion !== PRIVACY_POLICY_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    },
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
}

/**
 * Avvio del flusso Google: valida il returnUrl, firma lo state e reindirizza
 * alla schermata di consenso Google.
 */
router.get('/google/start', socialLoginLimiter, (req: Request, res: Response) => {
  if (!isGoogleLoginConfigured()) {
    return res.status(503).send('Accesso con Google non configurato.');
  }
  const returnUrl = typeof req.query.returnUrl === 'string' ? req.query.returnUrl : '';
  if (!isAllowedReturnUrl(returnUrl)) {
    return res.status(400).send('returnUrl non valido.');
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: signOauthState(returnUrl),
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/**
 * Callback Google: scambia il code, trova/crea l'utente e rimanda l'app al
 * returnUrl con un codice di login monouso (mai i token di sessione nell'URL).
 */
router.get('/google/callback', socialLoginLimiter, async (req: Request, res: Response) => {
  // Alcuni browser mobile (Chrome Android / browser in-app) richiamano questo
  // callback DUE volte con lo stesso authorization code. Google accetta il
  // code una sola volta: senza dedup la richiesta "visibile" all'utente può
  // essere la seconda, che fallirebbe con invalid_grant. Registriamo quindi il
  // redirect prodotto dal primo scambio (TTL 2 min, DB condiviso tra istanze)
  // e reindirizziamo le richieste duplicate allo stesso risultato.
  // I risultati contengono capability monouso a vita breve: mai farli
  // memorizzare da browser/proxy.
  res.setHeader('Cache-Control', 'no-store');
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  // La chiave lega code E state firmato: una richiesta con lo stesso code ma
  // state diverso non può recuperare il risultato altrui.
  const codeHash = code && state
    ? nodeCrypto.createHash('sha256').update(`${code}\n${state}`).digest('hex')
    : '';
  const readResult = async (): Promise<string | null> => {
    const [row] = await db
      .select()
      .from(oauthCallbackResults)
      .where(eq(oauthCallbackResults.codeHash, codeHash))
      .limit(1);
    if (row && row.redirectUrl && row.expiresAt.getTime() > Date.now()) return row.redirectUrl;
    return null;
  };
  // Attende (bounded) che la richiesta "vincitrice" scriva il risultato.
  const waitForResult = async (): Promise<string | null> => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const cached = await readResult();
      if (cached) return cached;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  };
  try {
    if (!code || !state) {
      return res.status(400).send('Richiesta non valida.');
    }
    const { returnUrl } = verifyOauthState(state);
    if (!isAllowedReturnUrl(returnUrl)) {
      return res.status(400).send('returnUrl non valido.');
    }
    // CLAIM ATOMICO: una sola richiesta (quella che inserisce la riga) fa lo
    // scambio con Google; le duplicate attendono il risultato sulla stessa
    // riga. redirect_url vuoto = "in lavorazione".
    const claimed = await db
      .insert(oauthCallbackResults)
      .values({ codeHash, redirectUrl: '', expiresAt: new Date(Date.now() + 2 * 60 * 1000) })
      .onConflictDoNothing()
      .returning({ codeHash: oauthCallbackResults.codeHash });
    if (claimed.length === 0) {
      // Richiesta duplicata: riusa il risultato della prima.
      const cached = await waitForResult();
      if (cached) return res.redirect(cached);
      return res.status(500).send("Errore durante l'accesso con Google. Riprova.");
    }
    const profile = await exchangeGoogleCode(code);
    const user = await findSocialUser(profile);
    const sep = returnUrl.includes('?') ? '&' : '?';
    let redirectTo: string;
    if (!user) {
      // Nuovo utente: NIENTE account finché non completa la registrazione
      // (fascia d'età, presa visione privacy, accettazione Termini).
      const signupToken = await createSocialSignupToken(profile, 'google');
      const nameParam = profile.name ? `&suggestedName=${encodeURIComponent(profile.name.slice(0, 100))}` : '';
      redirectTo = `${returnUrl}${sep}signupToken=${encodeURIComponent(signupToken)}${nameParam}`;
    } else {
      await activatePendingTrialsForUser(user.id);
      const loginCode = signLoginCode(user.id);
      redirectTo = `${returnUrl}${sep}loginCode=${encodeURIComponent(loginCode)}`;
    }
    // Pubblica il risultato per le eventuali richieste duplicate in attesa;
    // pulizia best-effort delle righe scadute.
    try {
      await db
        .update(oauthCallbackResults)
        .set({ redirectUrl: redirectTo })
        .where(eq(oauthCallbackResults.codeHash, codeHash));
      void Promise.resolve(
        db.delete(oauthCallbackResults).where(lt(oauthCallbackResults.expiresAt, new Date()))
      ).catch((err) => logger.warn('OAuth callback results cleanup failed', { error: String(err) }));
    } catch (cacheErr) {
      logger.warn('OAuth callback result publish failed', { error: String(cacheErr) });
    }
    res.redirect(redirectTo);
  } catch (error: any) {
    if (error?.code === 'ACCOUNT_DELETED') {
      return res.status(403).send('Questo account è stato eliminato.');
    }
    // Se lo scambio del "vincitore" fallisce, libera il claim così un vero
    // retry dell'utente (nuovo code) o la duplicata non restano bloccati.
    if (codeHash) {
      try {
        await db
          .delete(oauthCallbackResults)
          .where(and(eq(oauthCallbackResults.codeHash, codeHash), eq(oauthCallbackResults.redirectUrl, '')));
      } catch {
        // best-effort
      }
    }
    logger.error('Google OAuth callback error', { error: String(error) });
    res.status(500).send("Errore durante l'accesso con Google. Riprova.");
  }
});

/**
 * Scambio del codice di login monouso con i token di sessione.
 */
router.post('/oauth/complete', socialLoginLimiter, async (req: Request, res: Response) => {
  try {
    const code = typeof req.body?.loginCode === 'string' ? req.body.loginCode : '';
    if (!code) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'loginCode obbligatorio' } });
    }
    const { userId } = await verifyLoginCode(code);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.deletedAt) {
      return res.status(401).json({ error: { code: 'INVALID_CODE', message: 'Codice di accesso non valido' } });
    }
    res.json(issueSessionResponse(user));
  } catch (error) {
    logger.warn('OAuth complete error', { error: String(error) });
    res.status(401).json({ error: { code: 'INVALID_CODE', message: 'Codice di accesso scaduto o non valido' } });
  }
});

/**
 * Accesso con Apple: il client nativo invia l'identityToken di Sign in with
 * Apple; il server ne verifica firma/issuer/audience e autentica l'utente.
 */
router.post('/apple', socialLoginLimiter, async (req: Request, res: Response) => {
  try {
    const identityToken = typeof req.body?.identityToken === 'string' ? req.body.identityToken : '';
    if (!identityToken) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'identityToken obbligatorio' } });
    }
    // Apple fornisce il nome solo al primissimo accesso: il client lo inoltra.
    const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim().slice(0, 100) : '';
    const profile = await verifyAppleIdentityToken(identityToken);
    if (fullName) profile.name = fullName;
    const user = await findSocialUser(profile);
    if (!user) {
      // Nuovo utente: il client deve mostrare la schermata di completamento.
      const signupToken = await createSocialSignupToken(profile, 'apple');
      return res.status(200).json({
        needsCompletion: true,
        signupToken,
        suggestedName: profile.name || null,
      });
    }
    await activatePendingTrialsForUser(user.id);
    res.json(issueSessionResponse(user));
  } catch (error: any) {
    if (error?.code === 'ACCOUNT_DELETED') {
      return res.status(403).json({ error: { code: 'ACCOUNT_DELETED', message: 'Questo account è stato eliminato' } });
    }
    logger.warn('Apple login error', { error: String(error) });
    res.status(401).json({ error: { code: 'INVALID_APPLE_TOKEN', message: 'Accesso con Apple non riuscito. Riprova.' } });
  }
});

/** Config pubblica: dice al client quali login social sono disponibili. */
router.get('/social-config', (_req: Request, res: Response) => {
  res.json({ google: isGoogleLoginConfigured(), apple: true });
});

export default router;
