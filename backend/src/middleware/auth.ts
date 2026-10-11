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
    console.error('Auth middleware error:', error);
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
