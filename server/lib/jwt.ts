import jwt from 'jsonwebtoken';
import type { User } from '../../shared/schema';

const isProduction = process.env.NODE_ENV === 'production';

function resolveSecret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) {
    return value;
  }
  if (isProduction) {
    throw new Error(
      `[FATAL] La variabile d'ambiente ${name} è obbligatoria in produzione e non è impostata. Configurala prima di avviare il server.`
    );
  }
  return devFallback;
}

const JWT_SECRET = resolveSecret('JWT_SECRET', 'dev-secret-change-me');
const JWT_REFRESH_SECRET = resolveSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret');
const JWT_MEDIA_SECRET = resolveSecret('JWT_MEDIA_SECRET', 'dev-media-secret-change-me');

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface MediaTokenPayload {
  userId: string;
  scope: 'media';
  familyId?: string;
  filePath?: string;
}

export function generateAccessToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function generateRefreshToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    throw new Error('Invalid token');
  }
}

export function generateMediaToken(
  userId: string,
  opts?: { familyId?: string; filePath?: string }
): string {
  const payload: MediaTokenPayload = { userId, scope: 'media' };
  if (opts?.familyId) {
    payload.familyId = opts.familyId;
  }
  if (opts?.filePath) {
    payload.filePath = opts.filePath;
  }
  return jwt.sign(payload, JWT_MEDIA_SECRET, { expiresIn: '5m' });
}

export function verifyMediaToken(token: string): MediaTokenPayload {
  const decoded = jwt.verify(token, JWT_MEDIA_SECRET) as MediaTokenPayload;
  if (decoded.scope !== 'media') {
    throw new Error('Invalid media token scope');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
  } catch {
    throw new Error('Invalid refresh token');
  }
}
