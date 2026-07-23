import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users, emailVerificationTokens, passwordResetTokens } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateMediaToken } from '../lib/jwt';
import { resolveUploadFileAccess, userIsFamilyMember } from '../lib/media-auth';
import { sendVerificationEmail, sendPasswordResetEmail, isPasswordResetEmailConfigured, isVerificationEmailConfigured } from '../lib/email';
import { authenticate, requireEmailVerified } from '../middleware/auth';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { config } from '../lib/config';
import { generateResetToken, hashResetToken } from '../lib/reset-token';
import { deleteUserAccount } from '../lib/account-deletion';
import { activatePendingTrialsForUser } from '../lib/entitlements';
import { recordConsent } from '../lib/consents';
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
  // Opzionale per retrocompatibilità con client vecchi (trattata come 'adult').
  ageBand: z.enum(["under14", "14_17", "adult"]).optional(),
  // Consenso AI facoltativo e MAI preselezionato lato client.
  aiConsent: z.boolean().optional(),
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

    const { email, password, name, ageBand, aiConsent } = parsed.data;

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
      ageBand: ageBand ?? null,
      // Consenso AI esplicito e facoltativo: se non espresso resta disattivo
      // (opt-in, mai preselezionato). Riattivabile dalle impostazioni.
      aiFeaturesEnabled: aiConsent === true,
    }).returning();

    // Registro consensi (append-only): versione Termini accettata + scelta AI.
    await recordConsent(newUser.id, "terms", true);
    await recordConsent(newUser.id, "ai_features", aiConsent === true);
    
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
      await sendVerificationEmail(email, name, verificationToken);
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

router.post('/login', async (req: Request, res: Response) => {
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
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
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
    });
  } catch (error) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero utente" } });
  }
});

router.post('/change-password', authenticate, async (req: Request, res: Response) => {
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
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    res.json({ message: "Password aggiornata con successo" });
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

router.post('/resend-verification-email', authenticate, async (req: Request, res: Response) => {
  try {
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

    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      token: verificationToken,
      expiresAt,
    });

    await sendVerificationEmail(user.email, user.name, verificationToken);

    res.json({ message: 'Email di verifica inviata' });
  } catch (error) {
    logger.error('Resend verification error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'invio" } });
  }
});

router.post('/media-token', authenticate, requireEmailVerified, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

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
      const fileFamilyId = await resolveUploadFileAccess(userId, filePath);
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

    const mediaToken = generateMediaToken(userId, { familyId, filePath });

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

    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, claimed.userId));

    res.json({ message: 'Password reimpostata con successo' });
  } catch (error) {
    logger.error('Reset password error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il reset" } });
  }
});

// Eliminazione account: accessibile a qualsiasi utente autenticato (anche con
// email non verificata, perche e un diritto fondamentale e richiesto dagli store).
router.delete('/account', deleteAccountLimiter, authenticate, async (req: Request, res: Response) => {
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
 * Trova o crea l'utente per un login social. L'email arriva verificata dal
 * provider, quindi emailVerified=true. Se l'utente esiste già (anche con
 * password) viene semplicemente autenticato: stessa email = stesso account.
 */
async function upsertSocialUser(profile: OauthProfile, provider: 'google' | 'apple') {
  const [existing] = await db.select().from(users).where(eq(users.email, profile.email)).limit(1);
  if (existing) {
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
  const [created] = await db.insert(users).values({
    email: profile.email,
    passwordHash: null,
    authProvider: provider,
    name: profile.name || profile.email.split('@')[0],
    emailVerified: true,
    termsAcceptedAt: new Date(),
    // Consenso AI opt-in: mai attivo di default per i nuovi account.
    // L'utente può attivarlo dalle impostazioni (Privacy Center).
    aiFeaturesEnabled: false,
  }).returning();
  await recordConsent(created.id, "terms", true);
  await recordConsent(created.id, "ai_features", false);
  return created;
}

function issueSessionResponse(user: typeof users.$inferSelect) {
  return {
    user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
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
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) {
      return res.status(400).send('Richiesta non valida.');
    }
    const { returnUrl } = verifyOauthState(state);
    if (!isAllowedReturnUrl(returnUrl)) {
      return res.status(400).send('returnUrl non valido.');
    }
    const profile = await exchangeGoogleCode(code);
    const user = await upsertSocialUser(profile, 'google');
    await activatePendingTrialsForUser(user.id);
    const loginCode = signLoginCode(user.id);
    const sep = returnUrl.includes('?') ? '&' : '?';
    res.redirect(`${returnUrl}${sep}loginCode=${encodeURIComponent(loginCode)}`);
  } catch (error: any) {
    if (error?.code === 'ACCOUNT_DELETED') {
      return res.status(403).send('Questo account è stato eliminato.');
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
    const { userId } = verifyLoginCode(code);
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
    const user = await upsertSocialUser(profile, 'apple');
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
