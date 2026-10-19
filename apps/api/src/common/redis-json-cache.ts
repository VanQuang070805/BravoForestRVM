import { createHash } from 'crypto';
import Redis from 'ioredis';

export async function redisJsonCache<T>(
  redis: Redis,
  namespace: string,
  keyParts: unknown,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  let cacheKey: string | undefined;
  try {
    const version = await redis.get(`bravoforest:cache:version:${namespace}`) ?? '0';
    const digest = createHash('sha256').update(JSON.stringify(keyParts)).digest('hex');
    cacheKey = `bravoforest:cache:${namespace}:v${version}:${digest}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    cacheKey = undefined;
  }

  const value = await load();
  if (cacheKey) {
    try {
      await redis.set(cacheKey, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Redis is an optimization; the database remains the source of truth.
    }
  }
  return value;
}

export async function invalidateRedisJsonCache(redis: Redis, namespace: string) {
  try {
    await redis.incr(`bravoforest:cache:version:${namespace}`);
  } catch {
    // Existing entries expire by TTL if Redis is temporarily unavailable.
  }
}
