import jwt from 'jsonwebtoken';
import type { User } from '../../shared/schema';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const JWT_MEDIA_SECRET = process.env.JWT_MEDIA_SECRET || `${JWT_SECRET}::media`;

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface MediaTokenPayload {
  userId: string;
  scope: 'media';
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

export function generateMediaToken(userId: string, filePath?: string): string {
  const payload: { userId: string; scope: 'media'; filePath?: string } = { userId, scope: 'media' };
  if (filePath) {
    payload.filePath = filePath;
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
