import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: { max: number; windowMs: number; message?: string }) {
  const store = new Map<string, RateLimitRecord>();

  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (record.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}_${req.baseUrl || req.path}`;
    const now = Date.now();

    let record = store.get(key);
    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + options.windowMs };
      store.set(key, record);
      next();
      return;
    }

    record.count++;
    if (record.count > options.max) {
      res.status(429).json({
        error: options.message || 'Too many requests, please slow down.',
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}
