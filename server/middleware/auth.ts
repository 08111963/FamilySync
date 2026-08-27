import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifyMediaToken } from '../lib/jwt';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { normalizeUploadFileUrl, resolveUploadFileAccess, authorizeMediaRequest } from '../lib/media-auth';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email: string; isChildAccount?: boolean };
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
      .select({ deletedAt: users.deletedAt, isChildAccount: users.isChildAccount, tokenVersion: users.tokenVersion })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!record || record.deletedAt) {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
    }

    // Account "dispositivo bambino": revoca/riattivazione bumpano tokenVersion
    // e devono invalidare SUBITO anche gli access token del vecchio dispositivo
    // (fail-closed: un claim mancante non passa il confronto).
    if (record.isChildAccount === true && (payload as { tokenVersion?: number }).tokenVersion !== (record.tokenVersion ?? 0)) {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token non valido o scaduto" } });
    }

    // Flag "account dispositivo bambino" caricato una volta qui: i middleware
    // blockChildAccount/blockChildWrites lo usano senza query aggiuntive.
    req.user = { ...payload, isChildAccount: record.isChildAccount === true };
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

  // req.path è relativo al mount Express. Per i mount specifici (es.
  // /uploads/family-avatars) ricomponiamo il percorso completo, altrimenti il
  // token verrebbe controllato contro /uploads/<file> invece di /uploads/family-avatars/<file>.
  const requestedFileUrl = normalizeUploadFileUrl(`${req.baseUrl}${req.path}`);

  try {
    // Il claim child nel media token esclude gli allegati bollette anche in
    // fase di verifica: un token bambino non può mai servire file vietati.
    const fileFamilyId = await resolveUploadFileAccess(payload.userId, requestedFileUrl, {
      excludeBillAttachments: payload.child === true,
    });

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

export const CHILD_FORBIDDEN = {
  error: { code: "CHILD_FORBIDDEN", message: "Questa funzione non è disponibile per gli accessi bambino" },
} as const;

/**
 * Blocco fail-closed per gli account "dispositivo bambino" (accesso con codice
 * PIN): le aree vietate (bollette, budget, pagamenti, AI, impostazioni…) devono
 * rifiutare lato server, non solo nascondere nel client. Da montare DOPO
 * authenticate (usa il flag caricato lì; in sua assenza rifiuta per sicurezza).
 */
export function blockChildAccount(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: { code: "NO_TOKEN", message: "Token di autenticazione mancante" } });
  }
  // fail-closed: il flag è valorizzato da authenticate; se manca (percorso
  // anomalo, es. token media) rifiutiamo comunque.
  if (req.user.isChildAccount !== false) {
    return res.status(403).json(CHILD_FORBIDDEN);
  }
  next();
}

/**
 * Variante per i router che i bambini devono poter LEGGERE (famiglia, membri):
 * blocca solo i metodi di scrittura per gli account bambino, così restano
 * vietate gestione membri, inviti, impostazioni famiglia e generazione codici.
 */
export function blockChildWrites(req: Request, res: Response, next: NextFunction) {
  if (req.user?.isChildAccount === true && req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(403).json(CHILD_FORBIDDEN);
  }
  next();
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
