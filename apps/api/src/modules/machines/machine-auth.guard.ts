import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcrypt';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS } from '../../common/redis.module';

@Injectable()
export class MachineAuthGuard implements CanActivate {
  constructor(private readonly db: DataSource, @Inject(REDIS) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<any>();
    const machineId = Number(request.headers['x-machine-id']);
    const apiKey = String(request.headers['x-api-key'] ?? '');
    const nonce = String(request.headers['x-request-nonce'] ?? '');
    const timestamp = Number(request.headers['x-request-timestamp']);
    if (!Number.isInteger(machineId) || machineId < 1 || !apiKey || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)
      || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 300_000) {
      throw new UnauthorizedException('Invalid machine authentication headers');
    }

    const keys = await this.db.query(
      `SELECT k.key_hash FROM machine_api_keys k JOIN machines m ON m.machine_id=k.machine_id
       WHERE k.machine_id=? AND k.revoked_at IS NULL AND m.operational_status<>'DECOMMISSIONED'`,
      [machineId],
    );
    const valid = await Promise.all(keys.map((row: any) => compare(apiKey, String(row.key_hash).replace(/^\$2y\$/, '$2b$'))));
    if (!valid.some(Boolean)) throw new UnauthorizedException('Invalid machine key');

    const fresh = await this.redis.set(`machine-nonce:${machineId}:${nonce}`, '1', 'EX', 600, 'NX');
    if (!fresh) throw new UnauthorizedException('Replayed machine request');
    request.machineId = machineId;
    return true;
  }
}
