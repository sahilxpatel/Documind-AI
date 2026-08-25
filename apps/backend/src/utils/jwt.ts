import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';

export interface TokenPayload {
  id: string;
  role: string;
}

// config.JWT_SECRET is validated at startup (present, >=32 chars), so there is no
// insecure fallback value anywhere in the signing or verification path.
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'documind-api',
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET, {
    issuer: 'documind-api',
  });

  if (typeof decoded === 'string') {
    throw new Error('Malformed token payload');
  }

  const { id, role } = decoded as jwt.JwtPayload & Partial<TokenPayload>;
  if (typeof id !== 'string' || typeof role !== 'string') {
    throw new Error('Malformed token payload');
  }

  return { id, role };
}
