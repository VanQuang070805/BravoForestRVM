import { BadRequestException, ConflictException, Injectable, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash, randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { ScanDto } from './sessions.dto';

export function assertSingleOutcome(ruleId?: number, rejectReasonId?: number) {
  if (Boolean(ruleId) === Boolean(rejectReasonId)) {
    throw new BadRequestException('Exactly one of ruleId or rejectReasonId is required');
  }
}

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return null;
  const visible = local.length < 2 ? local[0] : `${local[0]}…${local.at(-1)}`;
  return `${visible}@${domain}`;
}

function databaseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
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
    @InjectQueue('bravoforest') private readonly queue: Queue,
  ) {}

  async create(machineId: number, mode: 'MEMBER' | 'GUEST' = 'MEMBER') {
    const qrToken = randomBytes(32).toString('hex');
    const qrTokenHash = createHash('sha256').update(qrToken).digest('hex');
    return this.db.transaction(async (manager) => {
      const [deployment] = await manager.query(
        `SELECT md.deployment_id, m.operational_status
         FROM machine_deployments md JOIN machines m ON m.machine_id=md.machine_id
         WHERE md.machine_id=? AND md.removed_at IS NULL FOR UPDATE`,
        [machineId],
      );
      if (!deployment) throw new BadRequestException('Machine is not deployed');
      if (deployment.operational_status !== 'ACTIVE') throw new ConflictException('Machine is not available');

      await manager.query(
        "UPDATE recycling_sessions SET status='EXPIRED',completed_at=COALESCE(completed_at,NOW()) WHERE deployment_id=? AND status='WAITING_LOGIN' AND qr_expires_at<=NOW()",
        [deployment.deployment_id],
      );
      const [activeSession] = await manager.query(
        "SELECT session_id FROM recycling_sessions WHERE deployment_id=? AND status IN ('WAITING_LOGIN','DEPOSITING','PROCESSING') LIMIT 1 FOR UPDATE",
        [deployment.deployment_id],
      );
      if (activeSession) throw new ConflictException('Machine already has an active session');

      const initialStatus = mode === 'GUEST' ? 'DEPOSITING' : 'WAITING_LOGIN';
      const result = await manager.query(
        'INSERT INTO recycling_sessions(deployment_id,qr_token,qr_expires_at,status,last_activity_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 2 MINUTE),?,NOW())',
        [deployment.deployment_id, qrTokenHash, initialStatus],
      );
      return {
        sessionId: String(result.insertId),
        statusToken: qrToken,
        ...(mode === 'MEMBER' ? { qrToken, expiresInSeconds: 120 } : {}),
        status: initialStatus,
      };
    });
  }

  async continueSession(machineId: number, id: string, token: string) {
    if (!/^\d{1,20}$/.test(id) || !/^[a-f0-9]{64}$/i.test(token ?? '')) {
      throw new NotFoundException('Session not found');
    }
    const sourceTokenHash = createHash('sha256').update(token).digest('hex');
    const statusToken = randomBytes(32).toString('hex');
    const statusTokenHash = createHash('sha256').update(statusToken).digest('hex');

    return this.db.transaction(async (manager) => {
      const [deployment] = await manager.query(
        `SELECT md.deployment_id,m.operational_status
         FROM machine_deployments md JOIN machines m ON m.machine_id=md.machine_id
         WHERE md.machine_id=? AND md.removed_at IS NULL FOR UPDATE`,
        [machineId],
      );
      if (!deployment) throw new BadRequestException('Machine is not deployed');
      if (deployment.operational_status !== 'ACTIVE') throw new ConflictException('Machine is not available');

      const [source] = await manager.query(
        `SELECT rs.session_id,rs.user_id,rs.status,
                (rs.last_activity_at >= DATE_SUB(NOW(),INTERVAL 5 MINUTE)) continuation_valid
         FROM recycling_sessions rs
         WHERE rs.session_id=? AND rs.deployment_id=? AND rs.qr_token=? FOR UPDATE`,
        [id, deployment.deployment_id, sourceTokenHash],
      );
      if (!source) throw new NotFoundException('Session not found');
      if (source.status !== 'COMPLETED' || !source.user_id || !databaseBoolean(source.continuation_valid)) {
        throw new ConflictException('Login session is no longer available. Please scan the QR code again.');
      }

      const [newerSession] = await manager.query(
        'SELECT session_id FROM recycling_sessions WHERE deployment_id=? AND session_id>? LIMIT 1 FOR UPDATE',
        [deployment.deployment_id, id],
      );
      if (newerSession) throw new ConflictException('A newer kiosk session has already started');

      const [activeSession] = await manager.query(
        "SELECT session_id FROM recycling_sessions WHERE deployment_id=? AND status IN ('WAITING_LOGIN','DEPOSITING','PROCESSING') LIMIT 1 FOR UPDATE",
        [deployment.deployment_id],
      );
      if (activeSession) throw new ConflictException('Machine already has an active session');

      const [account] = await manager.query(
        `SELECT u.full_name,u.email,w.wallet_id,w.status wallet_status
         FROM users u JOIN roles r ON r.role_id=u.role_id
         JOIN wallets w ON w.user_id=u.user_id
         WHERE u.user_id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL
           AND r.role_name='CUSTOMER' FOR UPDATE`,
        [source.user_id],
      );
      if (!account || account.wallet_status !== 'ACTIVE') {
        throw new UnauthorizedException('Customer account or wallet is unavailable');
      }

      const inserted = await manager.query(
        `INSERT INTO recycling_sessions(deployment_id,user_id,qr_token,qr_expires_at,status,linked_at,last_activity_at)
         VALUES(?,?,?,DATE_ADD(NOW(),INTERVAL 2 MINUTE),'DEPOSITING',NOW(),NOW())`,
        [deployment.deployment_id, source.user_id, statusTokenHash],
      );
      const [balance] = await manager.query(
        'SELECT COALESCE(balance,0) wallet_balance FROM v_wallet_balance WHERE wallet_id=?',
        [account.wallet_id],
      );

      return {
        sessionId: String(inserted.insertId),
        statusToken,
        status: 'DEPOSITING',
        customer: {
          fullName: account.full_name,
          maskedEmail: maskEmail(account.email),
          walletStatus: account.wallet_status,
          walletBalance: Number(balance?.wallet_balance ?? 0),
        },
      };
    });
  }

  async logoutSession(machineId: number, id: string, token: string) {
    if (!/^\d{1,20}$/.test(id) || !/^[a-f0-9]{64}$/i.test(token ?? '')) {
      return { ok: true };
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const revokedTokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
    await this.db.query(
      `UPDATE recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
       SET rs.qr_token=?
       WHERE rs.session_id=? AND md.machine_id=? AND md.removed_at IS NULL
         AND rs.status IN ('DEPOSITING','PROCESSING','COMPLETED') AND rs.qr_token=?`,
      [revokedTokenHash, id, machineId, tokenHash],
    );
    return { ok: true };
  }

  async claim(userId: string, token: string) {
    return this.db.transaction(async (manager) => {
      const [account] = await manager.query(
        `SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id
         JOIN wallets w ON w.user_id=u.user_id
         WHERE u.user_id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL
           AND r.role_name='CUSTOMER' AND w.status='ACTIVE' FOR UPDATE`,
        [userId],
      );
      if (!account) throw new UnauthorizedException('Tài khoản khách hàng hoặc ví điểm không khả dụng');

      const tokenHash = createHash('sha256').update(token).digest('hex');
      const [session] = await manager.query(
        `SELECT rs.*,(rs.status='WAITING_LOGIN' AND rs.qr_expires_at<=NOW()) qr_expired
         FROM recycling_sessions rs WHERE rs.qr_token=? FOR UPDATE`,
        [tokenHash],
      );
      if (!session) throw new NotFoundException('Session not found');
      if (databaseBoolean(session.qr_expired)) throw new ConflictException('QR token expired');
      const claimable = session.status === 'WAITING_LOGIN';
      if (!claimable || session.user_id) throw new ConflictException('Session is already linked or closed');

      await manager.query(
        "UPDATE recycling_sessions SET user_id=?,linked_at=NOW(),last_activity_at=NOW(),status='DEPOSITING' WHERE session_id=?",
        [userId, session.session_id],
      );
      return { sessionId: String(session.session_id), status: 'DEPOSITING' };
    });
  }

  async active(machineId: number) {
    return this.db.transaction(async (manager) => {
      const [session] = await manager.query(
        `SELECT rs.session_id,rs.status,rs.finish_requested_at,
                (rs.last_activity_at<=DATE_SUB(NOW(),INTERVAL 5 MINUTE)) idle
         FROM recycling_sessions rs
         JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
         WHERE md.machine_id=? AND md.removed_at IS NULL AND rs.status IN ('DEPOSITING','PROCESSING')
         ORDER BY rs.started_at DESC LIMIT 1 FOR UPDATE`,
        [machineId],
      );
      if (!session) return { sessionId: null, status: 'IDLE' };

      if (session.status === 'DEPOSITING' && !session.finish_requested_at && databaseBoolean(session.idle)) {
        await manager.query(
          'UPDATE recycling_sessions SET finish_requested_at=NOW() WHERE session_id=? AND finish_requested_at IS NULL',
          [session.session_id],
        );
        session.finish_requested_at = new Date();
      }

      return {
        sessionId: String(session.session_id),
        status: session.status,
        finishRequested: Boolean(session.finish_requested_at) || session.status === 'PROCESSING',
      };
    });
  }

  async activity(machineId: number, id: string, token: string) {
    if (!/^\d{1,20}$/.test(id) || !/^[a-f0-9]{64}$/i.test(token ?? '')) {
      throw new NotFoundException('Session not found');
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.db.transaction(async (manager) => {
      const [session] = await manager.query(
        `SELECT rs.status,rs.finish_requested_at,
                (rs.last_activity_at>=DATE_SUB(NOW(),INTERVAL 5 MINUTE)) continuation_valid
         FROM recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
         WHERE rs.session_id=? AND md.machine_id=? AND md.removed_at IS NULL AND rs.qr_token=? FOR UPDATE`,
        [id, machineId, tokenHash],
      );
      if (!session) throw new NotFoundException('Session not found');

      if (session.status === 'DEPOSITING' && !session.finish_requested_at) {
        await manager.query('UPDATE recycling_sessions SET last_activity_at=NOW() WHERE session_id=?', [id]);
        return { ok: true };
      }
      if (session.status === 'COMPLETED' && databaseBoolean(session.continuation_valid)) {
        await manager.query('UPDATE recycling_sessions SET last_activity_at=NOW() WHERE session_id=?', [id]);
        return { ok: true };
      }
      throw new ConflictException('Phiên đã kết thúc hoặc hết thời gian hoạt động. Hãy quét QR để bắt đầu lại.');
    });
  }

  async customerStatus(userId: string, id: string) {
    if (!/^\d{1,20}$/.test(id)) throw new NotFoundException('Session not found');
    const [session] = await this.db.query(
      'SELECT session_id,status FROM recycling_sessions WHERE session_id=? AND user_id=?',
      [id, userId],
    );
    if (!session) throw new NotFoundException('Session not found');
    return { sessionId: String(session.session_id), status: session.status };
  }

  async activeStatus(machineId: number, requestedSessionId?: string) {
    const session = requestedSessionId
      ? (await this.db.query(
          `SELECT rs.session_id FROM recycling_sessions rs
           JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
           WHERE rs.session_id=? AND md.machine_id=? AND md.removed_at IS NULL
             AND rs.status IN ('DEPOSITING','PROCESSING','COMPLETED','CANCELLED','EXPIRED')`,
          [requestedSessionId, machineId],
        ))[0]
      : (await this.db.query(
          `SELECT rs.session_id FROM recycling_sessions rs
           JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
           WHERE md.machine_id=? AND md.removed_at IS NULL
             AND rs.status IN ('DEPOSITING','PROCESSING')
           ORDER BY rs.started_at DESC LIMIT 1`,
          [machineId],
        ))[0];
    if (!session) {
      return {
        sessionId: null, status: 'IDLE', linked: false, finishRequested: false,
        expired: false, acceptedItems: 0, points: 0, customer: null, recentItems: [],
      };
    }
    return this.readMachineStatus(machineId, String(session.session_id));
  }

  async requestFinish(machineId: number, id: string) {
    return this.db.transaction(async (manager) => {
      const [session] = await manager.query(
        `SELECT rs.status,rs.finish_requested_at,
                EXISTS(SELECT 1 FROM deposit_items di WHERE di.session_id=rs.session_id) has_items
         FROM recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
         WHERE rs.session_id=? AND md.machine_id=? FOR UPDATE`,
        [id, machineId],
      );
      if (!session) throw new NotFoundException('Session not found');
      if (session.status === 'COMPLETED') {
        return { status: session.status, finishRequested: true, idempotent: true };
      }
      if (!['DEPOSITING', 'PROCESSING'].includes(session.status)) {
        throw new ConflictException('Session cannot be finished');
      }

      // An empty session has no machine events or wallet credit to reconcile.
      // Close it in this transaction so backing out before depositing does not
      // wait for a Pi controller that may not be running.
      if (!databaseBoolean(session.has_items)) {
        await manager.query(
          `UPDATE recycling_sessions
           SET status='COMPLETED',finish_requested_at=COALESCE(finish_requested_at,NOW()),
               confirmed_at=COALESCE(confirmed_at,NOW()),completed_at=COALESCE(completed_at,NOW()),
               last_activity_at=NOW()
           WHERE session_id=? AND status IN ('DEPOSITING','PROCESSING')`,
          [id],
        );
        return {
          status: 'COMPLETED', finishRequested: true, idempotent: false,
          emptySession: true, acceptedItems: 0, points: 0,
        };
      }

      if (session.status === 'PROCESSING') {
        return { status: session.status, finishRequested: true, idempotent: true };
      }
      await manager.query(
        'UPDATE recycling_sessions SET finish_requested_at=COALESCE(finish_requested_at,NOW()) WHERE session_id=?',
        [id],
      );
      return { status: 'DEPOSITING', finishRequested: true, idempotent: Boolean(session.finish_requested_at) };
    });
  }

  async machineStatus(machineId: number, sessionId: string, token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) throw new NotFoundException('Session not found');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.readMachineStatus(machineId, sessionId, tokenHash);
  }

  private async readMachineStatus(machineId: number, sessionId: string, tokenHash?: string) {
    const tokenClause = tokenHash ? 'AND rs.qr_token=?' : '';
    const parameters = tokenHash ? [sessionId, machineId, tokenHash] : [sessionId, machineId];
    const [session] = await this.db.query(
      `SELECT rs.status,rs.user_id,rs.finish_requested_at,
              (rs.user_id IS NOT NULL) linked,
              (rs.status='WAITING_LOGIN' AND rs.qr_expires_at<=NOW()) expired,
              LEAST(300,GREATEST(0,300-TIMESTAMPDIFF(SECOND,rs.last_activity_at,NOW()))) continuation_seconds_remaining,
              COUNT(di.rule_id) accepted_items,
              CASE WHEN rs.status='COMPLETED'
                THEN COALESCE((SELECT wt.points FROM wallet_transactions wt
                               WHERE wt.session_id=rs.session_id AND wt.txn_type='EARN' LIMIT 1),0)
                ELSE COALESCE(SUM(pr.points_per_item),0)
              END points
       FROM recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
       LEFT JOIN deposit_items di ON di.session_id=rs.session_id
       LEFT JOIN point_rules pr ON pr.rule_id=di.rule_id
       WHERE rs.session_id=? AND md.machine_id=? AND md.removed_at IS NULL ${tokenClause}
       GROUP BY rs.session_id,rs.status,rs.user_id,rs.finish_requested_at,rs.qr_expires_at,rs.last_activity_at`,
      parameters,
    );
    if (!session) throw new NotFoundException('Session not found');
    const [account] = session.user_id
      ? await this.db.query(
          `SELECT u.full_name,u.email,w.status wallet_status,COALESCE(vwb.balance,0) wallet_balance
           FROM users u LEFT JOIN wallets w ON w.user_id=u.user_id
           LEFT JOIN v_wallet_balance vwb ON vwb.wallet_id=w.wallet_id
           WHERE u.user_id=?`,
          [session.user_id],
        )
      : [];
    const recentItems = await this.db.query(
      `SELECT di.item_id,COALESCE(ct.name,rr.description,'Bao bì') item_name,
              (di.rule_id IS NOT NULL) accepted,COALESCE(pr.points_per_item,0) points,
              JSON_UNQUOTE(JSON_EXTRACT(di.sensor_data,'$.aiClass')) ai_class,
              CAST(JSON_UNQUOTE(JSON_EXTRACT(di.sensor_data,'$.aiConfidence')) AS DECIMAL(5,4)) ai_confidence,
              JSON_UNQUOTE(JSON_EXTRACT(di.sensor_data,'$.reason')) reject_reason,
              rr.code reject_code
       FROM deposit_items di
       LEFT JOIN point_rules pr ON pr.rule_id=di.rule_id
       LEFT JOIN container_types ct ON ct.container_type_id=pr.container_type_id
       LEFT JOIN reject_reasons rr ON rr.reject_reason_id=di.reject_reason_id
       WHERE di.session_id=? ORDER BY di.item_id DESC LIMIT 4`,
      [sessionId],
    );
    return {
      sessionId,
      status: session.status,
      linked: databaseBoolean(session.linked),
      finishRequested: Boolean(session.finish_requested_at) || session.status === 'PROCESSING',
      expired: databaseBoolean(session.expired),
      continuationSecondsRemaining: Number(session.continuation_seconds_remaining ?? 0),
      acceptedItems: Number(session.accepted_items),
      points: Number(session.points),
      customer: account ? {
        fullName: account.full_name,
        maskedEmail: maskEmail(account.email),
        walletStatus: account.wallet_status,
        walletBalance: Number(account.wallet_balance),
      } : null,
      recentItems,
    };
  }

  async scanOptions(machineId: number) {
    const [machine] = await this.db.query(
      `SELECT m.machine_code,l.name location_name,l.address,l.ward,l.district,l.city
       FROM machines m
       JOIN machine_deployments md ON md.machine_id=m.machine_id AND md.removed_at IS NULL
       JOIN machine_locations l ON l.location_id=md.location_id AND l.is_active=1
       WHERE m.machine_id=? AND m.operational_status='ACTIVE'`,
      [machineId],
    );
    if (!machine) throw new NotFoundException('Machine is not deployed or active');
    const items = await this.db.query(
      `SELECT DISTINCT pr.rule_id,ct.container_type_id,ct.name container_name,ct.volume_ml,
              m.code material_code,m.name material_name,pr.points_per_item
       FROM machine_bins b
       JOIN materials m ON m.material_id=b.material_id
       JOIN container_types ct ON ct.material_id=m.material_id AND ct.is_active=1
       JOIN point_rules pr ON pr.container_type_id=ct.container_type_id
       JOIN machine_deployments md ON md.machine_id=b.machine_id AND md.removed_at IS NULL
       JOIN machines machine ON machine.machine_id=md.machine_id
       WHERE b.machine_id=? AND b.status='ACTIVE' AND machine.operational_status='ACTIVE'
         AND pr.valid_from<=NOW() AND (pr.valid_to IS NULL OR pr.valid_to>NOW())
       ORDER BY m.name,ct.volume_ml,ct.name`,
      [machineId],
    );
    const rejectReasons = await this.db.query(
      'SELECT reject_reason_id,code,description FROM reject_reasons ORDER BY code',
    );
    return { machine, items, rejectReasons };
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
    return this.db.transaction(async (manager) => {
        const [session] = await manager.query(
          `SELECT rs.status,rs.user_id,md.machine_id
           FROM recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
           WHERE rs.session_id=? FOR UPDATE`,
          [sessionId],
        );
        if (!session || Number(session.machine_id) !== machineId) throw new NotFoundException('Session not found');
        if (session.status !== 'DEPOSITING') throw new ConflictException('Session does not accept items');

        // Locking the parent session serializes its item writes; the database unique key
        // remains the final guard if requests are retried after Redis/device restarts.
        const [prior] = await manager.query(
          `SELECT item_id,rule_id,reject_reason_id,request_hash
           FROM deposit_items WHERE session_id=? AND idempotency_key=? FOR UPDATE`,
          [sessionId, idempotencyKey],
        );
        if (prior) {
          if (prior.request_hash !== requestHash) {
            throw new ConflictException('Idempotency key was reused with a different item payload');
          }
          return { itemId: String(prior.item_id), accepted: Boolean(prior.rule_id), idempotent: true };
        }

        if (dto.ruleId) {
          const [rule] = await manager.query(
            `SELECT pr.rule_id FROM point_rules pr
             JOIN container_types ct ON ct.container_type_id=pr.container_type_id
             JOIN machine_bins b ON b.material_id=ct.material_id AND b.machine_id=? AND b.status='ACTIVE'
             JOIN machines m ON m.machine_id=b.machine_id AND m.operational_status='ACTIVE'
             JOIN machine_deployments md ON md.machine_id=m.machine_id AND md.removed_at IS NULL
             JOIN recycling_sessions rs ON rs.deployment_id=md.deployment_id AND rs.session_id=?
             WHERE pr.rule_id=? AND ct.is_active=1 AND pr.valid_from<=NOW()
               AND (pr.valid_to IS NULL OR pr.valid_to>NOW())`,
            [machineId, sessionId, dto.ruleId],
          );
          if (!rule) throw new BadRequestException('Point rule is inactive');
        } else {
          const [reason] = await manager.query('SELECT reject_reason_id FROM reject_reasons WHERE reject_reason_id=?', [dto.rejectReasonId]);
          if (!reason) throw new BadRequestException('Unknown reject reason');
        }

        const inserted = await manager.query(
          `INSERT INTO deposit_items(session_id,idempotency_key,request_hash,rule_id,reject_reason_id,
                                    scanned_barcode,measured_weight_g,sensor_data)
           VALUES(?,?,?,?,?,?,?,?)`,
          [sessionId, idempotencyKey, requestHash, dto.ruleId ?? null, dto.rejectReasonId ?? null,
            dto.barcode ?? null, dto.measuredWeightG ?? null,
            dto.sensorData == null ? null : JSON.stringify(dto.sensorData)],
        );
        await manager.query('UPDATE recycling_sessions SET last_activity_at=NOW() WHERE session_id=?', [sessionId]);
        return { itemId: String(inserted.insertId), accepted: Boolean(dto.ruleId), idempotent: false };
      });
  }

  async confirm(machineId: number, id: string) {
    return this.db.transaction(async (manager) => {
      const [session] = await manager.query(
        `SELECT rs.status,rs.finish_requested_at
         FROM recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
         WHERE rs.session_id=? AND md.machine_id=? FOR UPDATE`,
        [id, machineId],
      );
      if (!session) throw new NotFoundException('Session not found');
      if (session.status === 'PROCESSING' || session.status === 'COMPLETED') {
        return { status: session.status, idempotent: true };
      }
      if (session.status !== 'DEPOSITING' || !session.finish_requested_at) {
        throw new ConflictException('Session finish has not been requested');
      }
      await manager.query(
        `UPDATE recycling_sessions SET status='PROCESSING',confirmed_at=COALESCE(confirmed_at,NOW())
         WHERE session_id=? AND status='DEPOSITING'`,
        [id],
      );
      return { status: 'PROCESSING', idempotent: false };
    });
  }

  async cancel(machineId: number, id: string, token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) throw new NotFoundException('Session not found');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const result = await this.db.query(
      `UPDATE recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
       SET rs.status='CANCELLED',rs.completed_at=NOW()
       WHERE rs.session_id=? AND md.machine_id=? AND rs.qr_token=?
         AND rs.status='WAITING_LOGIN' AND rs.user_id IS NULL`,
      [id, machineId, tokenHash],
    );
    if (!result.affectedRows) throw new ConflictException('Session cannot be cancelled');
    return { ok: true };
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
        `SELECT COUNT(di.rule_id) accepted_items,COALESCE(SUM(pr.points_per_item),0) points
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
        `UPDATE recycling_sessions
         SET status='COMPLETED',confirmed_at=COALESCE(confirmed_at,NOW()),completed_at=NOW(),
             last_activity_at=CASE
               WHEN finish_requested_at IS NOT NULL
                 AND last_activity_at<=DATE_SUB(finish_requested_at,INTERVAL 5 MINUTE)
               THEN last_activity_at ELSE NOW() END
         WHERE session_id=?`,
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
