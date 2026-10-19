import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { compare } from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
import { SecretBox } from '../../common/security';
import { pageOptions, pagedQuery } from '../../common/pagination';
import { SubmitCashoutDto, UpdateCashoutPolicyDto } from './cashouts.dto';

const statuses = ['PENDING_REVIEW', 'APPROVED', 'PAID', 'REJECTED', 'FAILED'];
const MAX_SAFE_VND = BigInt(Number.MAX_SAFE_INTEGER);

type Policy = {
  enabled: number | boolean;
  points_per_step: number | string | null;
  vnd_per_step: number | string | null;
  min_points: number | string | null;
  max_points_per_request: number | string | null;
  max_points_per_day: number | string | null;
  version: number | string;
};

@Injectable()
export class CashoutsService {
  constructor(private readonly db: DataSource) {}

  private async policyRow(manager?: EntityManager, lock = false): Promise<Policy | undefined> {
    const [row] = await (manager ?? this.db).query(
      `SELECT * FROM cashout_policy WHERE policy_id=1${lock ? ' FOR UPDATE' : ''}`,
    );
    return row;
  }

  private policyDto(row?: Policy) {
    if (!row) return { enabled: false, configured: false };
    const configured = [row.points_per_step, row.vnd_per_step, row.min_points, row.max_points_per_request, row.max_points_per_day]
      .every((value) => value !== null && Number(value) > 0);
    return {
      enabled: Number(row.enabled) === 1,
      configured,
      pointsPerStep: row.points_per_step === null ? null : Number(row.points_per_step),
      vndPerStep: row.vnd_per_step === null ? null : Number(row.vnd_per_step),
      minPoints: row.min_points === null ? null : Number(row.min_points),
      maxPointsPerRequest: row.max_points_per_request === null ? null : Number(row.max_points_per_request),
      maxPointsPerDay: row.max_points_per_day === null ? null : Number(row.max_points_per_day),
      version: Number(row.version),
    };
  }

  customerPolicy() {
    return this.policyRow().then((row) => this.policyDto(row));
  }

  adminPolicy() {
    return this.policyRow().then((row) => this.policyDto(row));
  }

  async updatePolicy(dto: UpdateCashoutPolicyDto, actorId: string, ip?: string) {
    return this.db.transaction(async (manager) => {
      const current = await this.policyRow(manager, true);
      if (!current) throw new NotFoundException('Cash-out policy is not installed. Apply the cash-out database migration first.');
      const value = (incoming: number | null | undefined, stored: number | string | null) =>
        incoming === undefined ? (stored === null ? null : Number(stored)) : incoming;
      const next = {
        enabled: dto.enabled,
        pointsPerStep: value(dto.pointsPerStep, current.points_per_step),
        vndPerStep: value(dto.vndPerStep, current.vnd_per_step),
        minPoints: value(dto.minPoints, current.min_points),
        maxPointsPerRequest: value(dto.maxPointsPerRequest, current.max_points_per_request),
        maxPointsPerDay: value(dto.maxPointsPerDay, current.max_points_per_day),
      };

      const values = [next.pointsPerStep, next.vndPerStep, next.minPoints, next.maxPointsPerRequest, next.maxPointsPerDay];
      const configured = values.every((entry) => entry !== null && Number.isSafeInteger(entry) && Number(entry) > 0);
      if (next.enabled && !configured) throw new BadRequestException('Complete every conversion and limit field before enabling cash-outs');
      if (configured) {
        const step = Number(next.pointsPerStep);
        const minimum = Number(next.minPoints);
        const maximum = Number(next.maxPointsPerRequest);
        const daily = Number(next.maxPointsPerDay);
        if (minimum % step !== 0 || maximum % step !== 0 || daily % step !== 0) {
          throw new BadRequestException('Minimum and maximum point limits must be multiples of the conversion step');
        }
        if (maximum < minimum || daily < maximum) {
          throw new BadRequestException('Daily limit must be at least the per-request limit, and the latter must be at least the minimum');
        }
        const maxPayout = (BigInt(daily) / BigInt(step)) * BigInt(next.vndPerStep as number);
        if (maxPayout > MAX_SAFE_VND) throw new BadRequestException('The configured daily payout exceeds the supported amount');
      }

      await manager.query(
        `UPDATE cashout_policy SET enabled=?,points_per_step=?,vnd_per_step=?,min_points=?,
          max_points_per_request=?,max_points_per_day=?,version=version+1,updated_by=?,updated_at=NOW()
         WHERE policy_id=1`,
        [next.enabled ? 1 : 0, next.pointsPerStep, next.vndPerStep, next.minPoints,
          next.maxPointsPerRequest, next.maxPointsPerDay, actorId],
      );
      await this.audit(manager, actorId, 'UPDATE_CASHOUT_POLICY', 'CASHOUT_POLICY', 1, next, ip);
      return { ok: true, ...next, version: Number(current.version) + 1 };
    });
  }

  customerList(userId: string, page = '1', pageSize = '10') {
    const paging = pageOptions(page, pageSize);
    return pagedQuery(
      this.db,
      `SELECT cashout_id,points,amount_vnd,status,bank_name,account_last4,transfer_reference,
              decision_reason,created_at,reviewed_at,paid_at
       FROM cashout_requests WHERE user_id=? ORDER BY created_at DESC,cashout_id DESC`,
      'SELECT COUNT(*) total FROM cashout_requests WHERE user_id=?',
      [userId],
      paging,
    );
  }

  async submit(userId: string, dto: SubmitCashoutDto) {
    const [user] = await this.db.query('SELECT password_hash FROM users WHERE user_id=?', [userId]);
    if (!user || !(await compare(dto.currentPassword, user.password_hash))) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác.');
    }

    const bankName = dto.bankName.trim();
    const accountHolderName = dto.accountHolderName.trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi-VN');
    const accountNumber = dto.accountNumber.trim();
    if (bankName.length < 2 || accountHolderName.length < 2 || !/^\d{6,34}$/.test(accountNumber)) {
      throw new BadRequestException('Thông tin tài khoản ngân hàng chưa hợp lệ.');
    }
    const recipientCipher = new SecretBox().encrypt(JSON.stringify({ accountHolderName, accountNumber }));

    try {
      return await this.db.transaction(async (manager) => {
      const [existing] = await manager.query(
        `SELECT cashout_id,user_id,points,amount_vnd,status FROM cashout_requests
         WHERE idempotency_key=? FOR UPDATE`,
        [dto.idempotencyKey],
      );
      if (existing) {
        if (String(existing.user_id) !== userId) throw new ConflictException('Idempotency key already belongs to another account');
        return { cashoutId: String(existing.cashout_id), points: Number(existing.points), amountVnd: String(existing.amount_vnd), status: existing.status, idempotent: true };
      }

      const policy = await this.policyRow(manager, true);
      if (!policy || Number(policy.enabled) !== 1) throw new ConflictException('Tính năng đổi tiền đang tạm dừng.');
      if (!this.policyDto(policy).configured) throw new ConflictException('Chính sách đổi tiền chưa được cấu hình đầy đủ.');
      if (dto.policyVersion !== Number(policy.version)) throw new ConflictException('Chính sách vừa thay đổi. Vui lòng tải lại trang và kiểm tra tỷ giá mới.');
      const step = Number(policy.points_per_step);
      const vndStep = Number(policy.vnd_per_step);
      const minimum = Number(policy.min_points);
      const maximum = Number(policy.max_points_per_request);
      const dailyMaximum = Number(policy.max_points_per_day);
      if (dto.points < minimum || dto.points > maximum || dto.points % step !== 0) {
        throw new BadRequestException(`Số điểm phải từ ${minimum.toLocaleString('vi-VN')} đến ${maximum.toLocaleString('vi-VN')} và là bội số của ${step.toLocaleString('vi-VN')}.`);
      }

      const [wallet] = await manager.query('SELECT wallet_id,status FROM wallets WHERE user_id=? FOR UPDATE', [userId]);
      if (!wallet || wallet.status !== 'ACTIVE') throw new ConflictException('Ví điểm hiện không thể giao dịch.');
      const [{ balance }] = await manager.query('SELECT COALESCE(SUM(points),0) balance FROM wallet_transactions WHERE wallet_id=?', [wallet.wallet_id]);
      if (Number(balance) < dto.points) throw new BadRequestException('Số dư điểm không đủ.');

      const [{ usedToday }] = await manager.query(
        `SELECT COALESCE(SUM(points),0) usedToday FROM cashout_requests
         WHERE user_id=? AND status IN ('PENDING_REVIEW','APPROVED','PAID')
           AND created_at>=CURDATE() AND created_at<CURDATE()+INTERVAL 1 DAY`,
        [userId],
      );
      if (Number(usedToday) + dto.points > dailyMaximum) throw new ConflictException('Bạn đã đạt hạn mức đổi điểm trong ngày.');

      const amount = (BigInt(dto.points) / BigInt(step)) * BigInt(vndStep);
      if (amount <= 0n || amount > MAX_SAFE_VND) throw new BadRequestException('Số tiền đổi vượt giới hạn hỗ trợ.');
      const inserted = await manager.query(
        `INSERT INTO cashout_requests(wallet_id,user_id,points,amount_vnd,points_per_step,vnd_per_step,
          policy_version,bank_name,recipient_cipher,account_last4,status,idempotency_key)
         VALUES(?,?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?)`,
        [wallet.wallet_id, userId, dto.points, amount.toString(), step, vndStep, Number(policy.version),
          bankName, recipientCipher, accountNumber.slice(-4), dto.idempotencyKey],
      );
      const cashoutId = String(inserted.insertId);
      await manager.query(
        `INSERT INTO wallet_transactions(wallet_id,txn_type,points,cashout_id,note)
         VALUES(?,'CASHOUT',?,?,?)`,
        [wallet.wallet_id, -dto.points, cashoutId, `Đổi điểm thành tiền · yêu cầu #${cashoutId}`],
      );
      await this.audit(manager, userId, 'CREATE_CASHOUT_REQUEST', 'CASHOUT', cashoutId, { points: dto.points, amountVnd: amount.toString() });
      return { cashoutId, points: dto.points, amountVnd: amount.toString(), status: 'PENDING_REVIEW', idempotent: false };
      });
    } catch (error) {
      const [existing] = await this.db.query(
        `SELECT cashout_id,user_id,points,amount_vnd,status FROM cashout_requests WHERE idempotency_key=?`,
        [dto.idempotencyKey],
      );
      if (existing) {
        if (String(existing.user_id) !== userId) throw new ConflictException('Idempotency key already belongs to another account');
        return { cashoutId: String(existing.cashout_id), points: Number(existing.points), amountVnd: String(existing.amount_vnd), status: existing.status, idempotent: true };
      }
      throw error;
    }
  }

  adminList(search = '', status = '', page = '1', pageSize = '20') {
    if (status && !statuses.includes(status)) throw new BadRequestException('Invalid cash-out status');
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [term, term, term, status, status];
    const where = `WHERE (CAST(c.cashout_id AS CHAR) LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)
      AND (?='' OR c.status=?)`;
    return pagedQuery(
      this.db,
      `SELECT c.cashout_id,c.points,c.amount_vnd,c.status,c.bank_name,c.account_last4,
              c.transfer_reference,c.created_at,c.reviewed_at,c.paid_at,u.full_name,u.email
       FROM cashout_requests c JOIN users u ON u.user_id=c.user_id ${where}
       ORDER BY c.created_at DESC,c.cashout_id DESC`,
      `SELECT COUNT(*) total FROM cashout_requests c JOIN users u ON u.user_id=c.user_id ${where}`,
      params,
      paging,
    );
  }

  async adminDetail(cashoutId: string, actorId: string, ip?: string) {
    return this.db.transaction(async (manager) => {
      const [request] = await manager.query(
        `SELECT c.*,u.full_name,u.email FROM cashout_requests c JOIN users u ON u.user_id=c.user_id
         WHERE c.cashout_id=?`,
        [cashoutId],
      );
      if (!request) throw new NotFoundException('Cash-out request not found');
      let recipient: { accountHolderName: string; accountNumber: string };
      try { recipient = JSON.parse(new SecretBox().decrypt(request.recipient_cipher)); }
      catch { throw new ConflictException('Không thể giải mã thông tin nhận tiền. Kiểm tra khóa ENCRYPTION_KEY_BASE64.'); }
      await this.audit(manager, actorId, 'VIEW_CASHOUT_RECIPIENT', 'CASHOUT', cashoutId, undefined, ip);
      return {
        cashoutId: String(request.cashout_id), userId: String(request.user_id), fullName: request.full_name, email: request.email,
        points: Number(request.points), amountVnd: String(request.amount_vnd), pointsPerStep: Number(request.points_per_step),
        vndPerStep: Number(request.vnd_per_step), policyVersion: Number(request.policy_version), bankName: request.bank_name,
        accountHolderName: recipient.accountHolderName, accountNumber: recipient.accountNumber, status: request.status,
        decisionReason: request.decision_reason, transferReference: request.transfer_reference, createdAt: request.created_at,
        reviewedAt: request.reviewed_at, paidAt: request.paid_at,
      };
    });
  }

  approve(cashoutId: string, actorId: string, ip?: string) {
    return this.db.transaction(async (manager) => {
      const request = await this.lockRequest(manager, cashoutId);
      if (request.status !== 'PENDING_REVIEW') throw new ConflictException('Only requests awaiting review can be approved');
      await manager.query(
        `UPDATE cashout_requests SET status='APPROVED',reviewed_by=?,reviewed_at=NOW() WHERE cashout_id=?`,
        [actorId, cashoutId],
      );
      await this.audit(manager, actorId, 'APPROVE_CASHOUT', 'CASHOUT', cashoutId, { points: Number(request.points), amountVnd: String(request.amount_vnd) }, ip);
      return { ok: true, status: 'APPROVED' };
    });
  }

  reject(cashoutId: string, reason: string, actorId: string, ip?: string) {
    return this.failPending(cashoutId, reason, actorId, ip, 'REJECTED', 'REJECT_CASHOUT');
  }

  markPaid(cashoutId: string, transferReference: string, actorId: string, ip?: string) {
    return this.db.transaction(async (manager) => {
      const request = await this.lockRequest(manager, cashoutId);
      if (request.status !== 'APPROVED') throw new ConflictException('Only approved requests can be marked as paid');
      await manager.query(
        `UPDATE cashout_requests SET status='PAID',transfer_reference=?,paid_by=?,paid_at=NOW()
         WHERE cashout_id=?`,
        [transferReference.trim(), actorId, cashoutId],
      );
      await this.audit(manager, actorId, 'MARK_CASHOUT_PAID', 'CASHOUT', cashoutId, { transferReference: transferReference.trim() }, ip);
      return { ok: true, status: 'PAID' };
    });
  }

  fail(cashoutId: string, reason: string, actorId: string, ip?: string) {
    return this.db.transaction(async (manager) => {
      const request = await this.lockRequest(manager, cashoutId);
      if (request.status !== 'APPROVED') throw new ConflictException('Only approved requests with a confirmed failed transfer can be refunded');
      const pointsRefunded = await this.refund(manager, request, cashoutId, reason, actorId, ip, 'FAILED', 'FAIL_CASHOUT');
      return { ok: true, status: 'FAILED', pointsRefunded };
    });
  }

  private async failPending(cashoutId: string, reason: string, actorId: string, ip: string | undefined, status: 'REJECTED' | 'FAILED', action: string) {
    return this.db.transaction(async (manager) => {
      const request = await this.lockRequest(manager, cashoutId);
      if (request.status !== 'PENDING_REVIEW') throw new ConflictException('Only requests awaiting review can be rejected');
      const pointsRefunded = await this.refund(manager, request, cashoutId, reason, actorId, ip, status, action);
      return { ok: true, status, pointsRefunded };
    });
  }

  private async lockRequest(manager: EntityManager, cashoutId: string) {
    const [request] = await manager.query(
      `SELECT cashout_id,wallet_id,user_id,points,amount_vnd,status FROM cashout_requests
       WHERE cashout_id=? FOR UPDATE`,
      [cashoutId],
    );
    if (!request) throw new NotFoundException('Cash-out request not found');
    return request;
  }

  private async refund(
    manager: EntityManager,
    request: any,
    cashoutId: string,
    reason: string,
    actorId: string,
    ip: string | undefined,
    status: 'REJECTED' | 'FAILED',
    action: string,
  ) {
    const [debit] = await manager.query(
      `SELECT transaction_id FROM wallet_transactions
       WHERE cashout_id=? AND txn_type='CASHOUT' AND points<0 LIMIT 1 FOR UPDATE`,
      [cashoutId],
    );
    const pointsRefunded = debit ? Number(request.points) : 0;

    await manager.query(
      `UPDATE cashout_requests SET status=?,decision_reason=?,reviewed_by=?,reviewed_at=COALESCE(reviewed_at,NOW())
       WHERE cashout_id=?`,
      [status, reason.trim().slice(0, 255), actorId, cashoutId],
    );
    if (pointsRefunded > 0) {
      await manager.query(
        `INSERT INTO wallet_transactions(wallet_id,txn_type,points,cashout_id,created_by,note)
         VALUES(?,'CASHOUT_REFUND',?,?,?,?)`,
        [request.wallet_id, pointsRefunded, cashoutId, actorId, `Hoàn điểm yêu cầu #${cashoutId}: ${reason.trim().slice(0, 160)}`],
      );
    }
    await this.audit(manager, actorId, action, 'CASHOUT', cashoutId, { reason: reason.trim().slice(0, 255), pointsRefunded }, ip);
    return pointsRefunded;
  }

  private audit(manager: EntityManager, userId: string, action: string, entityType: string, entityId: string | number, detail?: unknown, ip?: string) {
    return manager.query(
      `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail,ip_address) VALUES(?,?,?,?,?,?)`,
      [userId, action, entityType, entityId, detail == null ? null : JSON.stringify(detail), ip ?? null],
    );
  }
}
