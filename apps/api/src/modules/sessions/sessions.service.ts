import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createHash, randomBytes } from 'crypto';
import { setTimeout as delay } from 'timers/promises';
import { DataSource } from 'typeorm';
import { REDIS } from '../../common/redis.module';
import { ScanDto } from './sessions.dto';

export function assertSingleOutcome(ruleId?: number, rejectReasonId?: number) {
  if (Boolean(ruleId) === Boolean(rejectReasonId)) {
    throw new BadRequestException('Exactly one of ruleId or rejectReasonId is required');
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly db: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue('bravoforest') private readonly queue: Queue,
  ) {}

  async create(machineId: number, mode: 'MEMBER' | 'GUEST' = 'MEMBER') {
    const qrToken = randomBytes(32).toString('hex');
    return this.db.transaction(async (manager) => {
      const [deployment] = await manager.query(
        `SELECT md.deployment_id, m.operational_status
         FROM machine_deployments md JOIN machines m ON m.machine_id=md.machine_id
         WHERE md.machine_id=? AND md.removed_at IS NULL FOR UPDATE`,
        [machineId],
      );
      if (!deployment) throw new BadRequestException('Machine is not deployed');
      if (deployment.operational_status !== 'ACTIVE') throw new ConflictException('Machine is not available');

      const initialStatus = mode === 'GUEST' ? 'DEPOSITING' : 'WAITING_LOGIN';
      const result = await manager.query(
        'INSERT INTO recycling_sessions(deployment_id,qr_token,qr_expires_at,status) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 2 MINUTE),?)',
        [deployment.deployment_id, qrToken, initialStatus],
      );
      return { sessionId: String(result.insertId), qrToken, expiresInSeconds: 120, status: initialStatus };
    });
  }

  async claim(userId: string, token: string) {
    return this.db.transaction(async (manager) => {
      const [session] = await manager.query('SELECT * FROM recycling_sessions WHERE qr_token=? FOR UPDATE', [token]);
      if (!session) throw new NotFoundException('Session not found');
      if (new Date(session.qr_expires_at) <= new Date()) throw new ConflictException('QR token expired');
      const claimable = session.status === 'WAITING_LOGIN' || (session.status === 'DEPOSITING' && !session.user_id);
      if (!claimable || session.user_id) throw new ConflictException('Session is already linked or closed');

      await manager.query(
        "UPDATE recycling_sessions SET user_id=?,linked_at=NOW(),status='DEPOSITING' WHERE session_id=?",
        [userId, session.session_id],
      );
      return { sessionId: String(session.session_id), status: 'DEPOSITING' };
    });
  }

  async scan(machineId: number, sessionId: string, dto: ScanDto, idempotencyKey?: string) {
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 64) {
      throw new BadRequestException('x-idempotency-key must contain 8 to 64 characters');
    }
    assertSingleOutcome(dto.ruleId, dto.rejectReasonId);

    const requestHash = createHash('sha256')
      .update(stableJson({
        ruleId: dto.ruleId ?? null,
        rejectReasonId: dto.rejectReasonId ?? null,
        barcode: dto.barcode ?? null,
        measuredWeightG: dto.measuredWeightG ?? null,
        sensorData: dto.sensorData ?? null,
      }))
      .digest('hex');
    const cacheKey = `scan:${machineId}:${sessionId}:${idempotencyKey}`;
    const lockKey = `${cacheKey}:lock`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const entry = JSON.parse(cached);
      if (entry.requestHash !== requestHash) throw new ConflictException('Idempotency key was reused with a different item payload');
      return entry.result;
    }

    const lockToken = randomBytes(16).toString('hex');
    const acquired = await this.redis.set(lockKey, lockToken, 'EX', 30, 'NX');
    if (!acquired) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await delay(100);
        const result = await this.redis.get(cacheKey);
        if (result) {
          const entry = JSON.parse(result);
          if (entry.requestHash !== requestHash) throw new ConflictException('Idempotency key was reused with a different item payload');
          return entry.result;
        }
      }
      throw new ConflictException('This item request is still being processed');
    }

    try {
      const result = await this.db.transaction(async (manager) => {
        // Persist the request key in the existing sensor JSON so a retry remains safe after Redis restarts.
        const [prior] = await manager.query(
          `SELECT di.item_id,di.rule_id,di.reject_reason_id,
                  JSON_UNQUOTE(JSON_EXTRACT(di.sensor_data,'$.requestHash')) request_hash
           FROM deposit_items di
           JOIN recycling_sessions rs ON rs.session_id=di.session_id
           JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
           WHERE md.machine_id=? AND rs.session_id=?
             AND JSON_UNQUOTE(JSON_EXTRACT(di.sensor_data,'$.requestKey'))=?
           LIMIT 1 FOR UPDATE`,
          [machineId, sessionId, idempotencyKey],
        );
        if (prior) {
          if (prior.request_hash && prior.request_hash !== requestHash) {
            throw new ConflictException('Idempotency key was reused with a different item payload');
          }
          return { itemId: String(prior.item_id), accepted: Boolean(prior.rule_id), idempotent: true };
        }

        const [session] = await manager.query(
          `SELECT rs.status,rs.user_id,md.machine_id
           FROM recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
           WHERE rs.session_id=? FOR UPDATE`,
          [sessionId],
        );
        if (!session || Number(session.machine_id) !== machineId) throw new NotFoundException('Session not found');
        if (!['WAITING_LOGIN', 'DEPOSITING'].includes(session.status)) {
          throw new ConflictException('Session does not accept items');
        }

        if (dto.ruleId) {
          const [rule] = await manager.query(
            `SELECT pr.rule_id FROM point_rules pr
             JOIN container_types ct ON ct.container_type_id=pr.container_type_id
             WHERE pr.rule_id=? AND ct.is_active=1 AND pr.valid_from<=NOW()
               AND (pr.valid_to IS NULL OR pr.valid_to>NOW())`,
            [dto.ruleId],
          );
          if (!rule) throw new BadRequestException('Point rule is inactive');
        } else {
          const [reason] = await manager.query('SELECT reject_reason_id FROM reject_reasons WHERE reject_reason_id=?', [dto.rejectReasonId]);
          if (!reason) throw new BadRequestException('Unknown reject reason');
        }

        const sensorData = { ...(dto.sensorData ?? {}), requestKey: idempotencyKey, requestHash };
        const inserted = await manager.query(
          `INSERT INTO deposit_items(session_id,rule_id,reject_reason_id,scanned_barcode,measured_weight_g,sensor_data)
           VALUES(?,?,?,?,?,?)`,
          [sessionId, dto.ruleId ?? null, dto.rejectReasonId ?? null, dto.barcode ?? null,
            dto.measuredWeightG ?? null, JSON.stringify(sensorData)],
        );
        if (session.status === 'WAITING_LOGIN') {
          await manager.query("UPDATE recycling_sessions SET status='DEPOSITING' WHERE session_id=?", [sessionId]);
        }
        return { itemId: String(inserted.insertId), accepted: Boolean(dto.ruleId), idempotent: false };
      });

      await this.redis.set(cacheKey, JSON.stringify({ requestHash, result }), 'EX', 86400);
      return result;
    } finally {
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken,
      );
    }
  }

  async confirm(machineId: number, id: string) {
    return this.transition(machineId, id, 'DEPOSITING', 'PROCESSING', 'confirmed_at');
  }

  async cancel(machineId: number, id: string) {
    const result = await this.db.query(
      `UPDATE recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
       SET rs.status='CANCELLED',rs.completed_at=NOW()
       WHERE rs.session_id=? AND md.machine_id=? AND rs.status IN ('WAITING_LOGIN','DEPOSITING','PROCESSING')`,
      [id, machineId],
    );
    if (!result.affectedRows) throw new ConflictException('Session cannot be cancelled');
    return { ok: true };
  }

  private async transition(machineId: number, id: string, from: string, to: string, timeColumn: string) {
    const result = await this.db.query(
      `UPDATE recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
       SET rs.status=?,rs.${timeColumn}=NOW() WHERE rs.session_id=? AND md.machine_id=? AND rs.status=?`,
      [to, id, machineId, from],
    );
    if (!result.affectedRows) throw new ConflictException(`Session must be ${from}`);
    return { status: to };
  }

  async finalize(machineId: number, id: string) {
    const result = await this.db.transaction(async (manager) => {
      const [session] = await manager.query(
        `SELECT rs.* FROM recycling_sessions rs
         JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
         WHERE rs.session_id=? AND md.machine_id=? FOR UPDATE`,
        [id, machineId],
      );
      if (!session) throw new NotFoundException('Session not found');
      if (session.status === 'COMPLETED') {
        const [transaction] = await manager.query('SELECT points FROM wallet_transactions WHERE session_id=?', [id]);
        return { status: 'COMPLETED', points: transaction?.points ?? 0, idempotent: true };
      }
      if (session.status !== 'PROCESSING') throw new ConflictException('Session must be PROCESSING');

      const [totals] = await manager.query(
        `SELECT COUNT(*) accepted_items,COALESCE(SUM(pr.points_per_item),0) points
         FROM deposit_items di LEFT JOIN point_rules pr ON pr.rule_id=di.rule_id WHERE di.session_id=?`,
        [id],
      );
      const points = Number(totals.points);
      if (session.user_id && points > 0) {
        const [wallet] = await manager.query('SELECT wallet_id,status FROM wallets WHERE user_id=? FOR UPDATE', [session.user_id]);
        if (!wallet || wallet.status !== 'ACTIVE') throw new ConflictException('Wallet unavailable');
        await manager.query(
          "INSERT INTO wallet_transactions(wallet_id,txn_type,points,session_id,note) VALUES(?,'EARN',?,?,?)",
          [wallet.wallet_id, points, id, 'Recycling session'],
        );
      }
      await manager.query(
        "UPDATE recycling_sessions SET status='COMPLETED',confirmed_at=COALESCE(confirmed_at,NOW()),completed_at=NOW() WHERE session_id=?",
        [id],
      );
      return { status: 'COMPLETED', points, acceptedItems: Number(totals.accepted_items), idempotent: false };
    });

    try {
      await this.queue.add('analytics-session', { sessionId: id }, { jobId: `session-${id}`, removeOnComplete: 100 });
    } catch (error) {
      this.logger.error(`Could not queue analytics for session ${id}`, error instanceof Error ? error.stack : undefined);
    }
    return result;
  }

  history(userId: string) {
    return this.db.query('SELECT * FROM v_session_summary WHERE user_id=? ORDER BY started_at DESC', [userId]);
  }

  detail(userId: string, id: string) {
    return this.db.query(
      `SELECT * FROM v_session_item_detail WHERE session_id=?
       AND EXISTS(SELECT 1 FROM recycling_sessions WHERE session_id=? AND user_id=?)`,
      [id, id, userId],
    );
  }
}
