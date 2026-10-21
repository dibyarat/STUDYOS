import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Standard non-sensitive JSON error format for 429 Too Many Requests responses.
 * Avoids leaking internal stack traces or configuration details.
 */
export const standardRateLimitHandler = (_req: Request, res: Response): void => {
  res.status(429).json({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Too many requests from this client, please try again later.',
  });
};

/**
 * Predicate to identify internal health and uptime monitoring requests.
 * Health checks must never be rate-limited or blocked to ensure reliable monitoring.
 */
export const isHealthCheck = (req: Request): boolean => {
  const path = req.path;
  return path === '/health' || path === '/api/health';
};

/**
 * Composite Key Generator:
 * Identifies users by authenticated user ID if available, otherwise by normalized IPv4/IPv6 address.
 * Prevents NAT collisions for shared campus networks and blocks IP rotation by authenticated accounts.
 */
export const compositeKeyGenerator = (req: Request): string => {
  const user = (req as any).user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  const rawIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return ipKeyGenerator(rawIp);
};

/**
 * General API Limiter:
 * Allows 120 requests per minute per IP address.
 * Generous enough for normal student workflows (page navigation, dashboard polling, asset metadata),
 * while stopping rapid automated scraping and abusive request floods.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: 120, // max 120 requests per minute
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: isHealthCheck,
  handler: standardRateLimitHandler,
});

/**
 * Sensitive Endpoints Rate Limiter:
 * 20 requests per minute per user/IP for operations like:
 * - User synchronization (/sync-user)
 * - Profile mutations
 * - Multi-collection search (/search)
 * Mitigates credential stuffing, synchronization replay, and heavy full-text search CPU load.
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  limit: 20, // max 20 requests per minute
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: isHealthCheck,
  keyGenerator: compositeKeyGenerator,
  handler: standardRateLimitHandler,
});

/**
 * File Upload Limiter:
 * 5 uploads per minute per user/IP. Prevents process RAM exhaustion and Cloudinary storage/bandwidth abuse.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: compositeKeyGenerator,
  handler: standardRateLimitHandler,
});

/**
 * Chat Messaging Limiter:
 * 20 messages per minute per user. Prevents chat flood spam and transaction cascades.
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: compositeKeyGenerator,
  handler: standardRateLimitHandler,
});

/**
 * Transaction / State Mutation Limiter:
 * 15 state mutations per minute per user for serializable transactions in help requests, claims, and teams.
 */
export const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: compositeKeyGenerator,
  handler: standardRateLimitHandler,
});
