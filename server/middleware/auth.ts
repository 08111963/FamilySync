import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifyMediaToken } from '../lib/jwt';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { normalizeUploadFileUrl, resolveUploadFileAccess, authorizeMediaRequest } from '../lib/media-auth';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email: string; };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  let payload;
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
    }

    const token = authHeader.substring(7);
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
  }

  try {
    // Revoca immediata per account cancellati: il token resta valido fino a
    // scadenza, ma un account anonimizzato (deletedAt valorizzato) non deve
    // poter accedere ad alcun endpoint protetto ("disconnessione da tutti i
    // dispositivi"). Lookup su PK indicizzata.
    const [record] = await db
      .select({ deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!record || record.deletedAt) {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
    }

    req.user = payload;
    next();
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'autenticazione" } });
  }
}

export async function authenticateMedia(req: Request, res: Response, next: NextFunction) {
  const token = typeof req.query.token === 'string' && req.query.token.length > 0
    ? req.query.token
    : undefined;

  if (!token) {
    return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
  }

  let payload;
  try {
    payload = verifyMediaToken(token);
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
  }

  const requestedFileUrl = normalizeUploadFileUrl(req.path);

  try {
    const fileFamilyId = await resolveUploadFileAccess(payload.userId, requestedFileUrl);

    const decision = authorizeMediaRequest({
      requestedFileUrl,
      fileFamilyId,
      tokenFilePath: payload.filePath,
      tokenFamilyId: payload.familyId,
    });

    if (!decision.ok) {
      return res.status(403).json({ error: { code: "FORBIDDEN_FILE", message: "Non hai i permessi per accedere a questo file" } });
    }
  } catch {
    return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante la verifica dei permessi" } });
  }

  req.user = { userId: payload.userId, email: '' };
  next();
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
