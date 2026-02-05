import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users, emailVerificationTokens, passwordResetTokens } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email';
import { authenticate } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// SIGNUP
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password e nome richiesti' });
    }
    
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email già registrata' });
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    
    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      name,
      emailVerified: false,
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
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Errore durante la registrazione' });
  }
});

// LOGIN
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password richiesti' });
    }
    
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    res.json({
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Errore durante il login' });
  }
});

// REFRESH TOKEN
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token richiesto' });
    }
    
    const payload = verifyRefreshToken(refreshToken);
    
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    
    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato' });
    }
    
    const newAccessToken = generateAccessToken(user);
    
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: 'Refresh token non valido' });
  }
});

// ME
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero utente' });
  }
});

// VERIFY EMAIL
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    const [tokenRecord] = await db.select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token))
      .limit(1);
    
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Token non valido' });
    }
    
    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: 'Token scaduto' });
    }
    
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, tokenRecord.userId));
    
    await db.delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, token));
    
    res.json({ message: 'Email verificata con successo' });
  } catch (error) {
    res.status(500).json({ error: 'Errore durante la verifica' });
  }
});

// REQUEST PASSWORD RESET
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
    res.status(500).json({ error: 'Errore durante la richiesta' });
  }
});

// RESET PASSWORD
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    
    const [tokenRecord] = await db.select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);
    
    if (!tokenRecord) {
      return res.status(400).json({ error: 'Token non valido' });
    }
    
    if (new Date() > tokenRecord.expiresAt) {
      return res.status(400).json({ error: 'Token scaduto' });
    }
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, tokenRecord.userId));
    
    await db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    
    res.json({ message: 'Password reimpostata con successo' });
  } catch (error) {
    res.status(500).json({ error: 'Errore durante il reset' });
  }
});

export default router;
