import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users, emailVerificationTokens, passwordResetTokens } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email';
import { authenticate } from '../middleware/auth';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const signupSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(6, "La password deve avere almeno 6 caratteri"),
  name: z.string().min(1, "Il nome è obbligatorio").max(100),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Devi accettare Privacy Policy e Termini d'Uso" }) }),
});

const loginSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(1, "La password è obbligatoria"),
});

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { email, password, name } = parsed.data;

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
    }).returning();
    
    const verificationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    
    await db.insert(emailVerificationTokens).values({
      userId: newUser.id,
      token: verificationToken,
      expiresAt,
    });
    
    await sendVerificationEmail(email, name, verificationToken);
    
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
    
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Credenziali non valide" } });
    }
    
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
    
    if (!user) {
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
    
    if (!user) {
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

router.post('/request-password-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      return res.json({ message: 'Se l\'email esiste, riceverai un link' });
    }
    
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: resetToken,
      expiresAt,
    });
    
    await sendPasswordResetEmail(email, user.name, resetToken);
    
    res.json({ message: 'Se l\'email esiste, riceverai un link' });
  } catch (error) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la richiesta" } });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    
    const [tokenRecord] = await db.select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
    
    if (!tokenRecord) {
      return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Token non valido" } });
    }
    
    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: { code: "TOKEN_EXPIRED", message: "Token scaduto" } });
    }
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, tokenRecord.userId));
    
    await db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    
    res.json({ message: 'Password reimpostata con successo' });
  } catch (error) {
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante il reset" } });
  }
});

export default router;
