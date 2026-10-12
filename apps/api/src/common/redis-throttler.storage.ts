import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

const INCREMENT_SCRIPT = `
local blockedTtl = redis.call('PTTL', KEYS[2])
local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
if blockedTtl > 0 then
  return { hits, redis.call('PTTL', KEYS[1]), 1, blockedTtl }
end
if blockedTtl == -1 then redis.call('DEL', KEYS[2]) end
hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, ARGV[3] }
end
return { hits, ttl, 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const bucket = `bravoforest:throttle:${throttlerName}:${key}`;
    const values = await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      bucket,
      `${bucket}:blocked`,
      Math.max(1, Math.ceil(ttl)),
      Math.max(1, Math.floor(limit)),
      Math.max(1, Math.ceil(blockDuration || ttl)),
    ) as Array<string | number>;

    return {
      totalHits: Number(values[0]),
      timeToExpire: Math.max(0, Number(values[1])),
      isBlocked: Number(values[2]) === 1,
      timeToBlockExpire: Math.max(0, Number(values[3])),
    };
  }
}
