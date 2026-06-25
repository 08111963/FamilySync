import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email: string; };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }
    
    const token = authHeader.substring(7);
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
  }
}

export function authenticateMedia(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (typeof req.query.token === 'string' && req.query.token.length > 0) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }

    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
  }
}

export async function requireEmailVerified(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }

    const [record] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);

    if (!record) {
      return res.status(401).json({ error: { code: "USER_NOT_FOUND", message: "Utente non trovato" } });
    }

    if (!record.emailVerified) {
      return res.status(403).json({
        error: { code: "EMAIL_NOT_VERIFIED", message: "Devi verificare la tua email per accedere a questa funzione" },
      });
    }

    next();
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica email" } });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      req.user = verifyAccessToken(token);
    }
    next();
  } catch {
    next();
  }
}
