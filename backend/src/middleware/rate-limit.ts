import rateLimit from 'express-rate-limit';
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
 * Stricter limit of 20 requests per minute per IP address for operations like:
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
  handler: standardRateLimitHandler,
});

