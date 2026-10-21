import type { NextFunction, Request, Response } from 'express';
import { getFirebaseAuth } from '../lib/firebase';
import { prisma } from '../lib/prisma';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string | null;
    dbUser?: Record<string, unknown>;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : null;

  if (!accessToken || accessToken === 'undefined' || accessToken === 'null') {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decodedToken = await getFirebaseAuth().verifyIdToken(accessToken);

    if (!decodedToken.uid) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    const safeEmail = decodedToken.email || null;
    const name = decodedToken.name || safeEmail?.split('@')[0] || 'StudyOS User';
    const avatarUrl = decodedToken.picture || '';

    req.user = {
      id: decodedToken.uid,
      email: safeEmail || undefined,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', (error as Error).message);
    // Explicitly restrict unverified token fallback: NEVER allow in production or staging.
    // In local development, require BOTH NODE_ENV === 'development' AND explicit ALLOW_DEV_UNVERIFIED_AUTH === 'true'.
    const isExplicitDevMockAllowed =
      process.env.NODE_ENV === 'development' &&
      process.env.ALLOW_DEV_UNVERIFIED_AUTH === 'true';

    if (isExplicitDevMockAllowed) {
      try {
        const parts = accessToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          const uid = payload.user_id || payload.sub || payload.uid;
          if (uid) {
            console.warn(`[SECURITY WARNING] Non-production unverified token fallback explicitly used for uid: ${uid}`);
            req.user = {
              id: uid,
              email: payload.email || undefined,
            };
            return next();
          }
        }
      } catch {
        // fallback decoding failed
      }
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireUserMatch(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const targetUserId = req.params.userId || req.body.userId;
  if (!req.user || !targetUserId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.id !== targetUserId) {
    res.status(403).json({ error: 'You do not have permission to access this account' });
    return;
  }

  next();
}
