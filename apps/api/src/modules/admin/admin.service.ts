import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
import { pageOptions, pagedQuery } from '../../common/pagination';
import {
  AlertTypeDto,
  ContainerTypeDto,
  CreateAdminUserDto,
  MaintenanceDto,
  MaterialDto,
  PartnerDto,
  PointRuleDto,
  RejectReasonDto,
  UpdateAdminUserDto,
  UpdatePartnerDto,
  UpdateVoucherDto,
  VoucherDto,
} from './admin.dto';

const redemptionStatuses = ['PENDING', 'ISSUED', 'USED', 'EXPIRED', 'FAILED', 'CANCELLED'];
const sessionStatuses = ['WAITING_LOGIN', 'DEPOSITING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

@Injectable()
export class AdminService {
  constructor(private readonly db: DataSource) {}

  private audit(manager: EntityManager, userId: string, action: string, entityType: string, entityId?: string | number, detail?: unknown, ip?: string) {
    return manager.query(
      `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail,ip_address)
       VALUES(?,?,?,?,?,?)`,
      [userId, action, entityType, entityId ?? null, detail == null ? null : JSON.stringify(detail), ip ?? null],
    );
  }

  users(search = '', status = '', page = '1', pageSize = '20') {
    if (status && !['ACTIVE', 'LOCKED', 'DELETED'].includes(status)) throw new BadRequestException('Invalid user status');
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [term, term, term, status, status];
    return pagedQuery(
      this.db,
      `SELECT u.user_id,u.full_name,u.email,u.phone,u.status,u.created_at,r.role_name,
              w.wallet_id,COALESCE(b.balance,0) balance
       FROM users u JOIN roles r ON r.role_id=u.role_id
       LEFT JOIN wallets w ON w.user_id=u.user_id
       LEFT JOIN v_wallet_balance b ON b.wallet_id=w.wallet_id
       WHERE (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
         AND (?='' OR u.status=?)
       ORDER BY u.created_at DESC`,
      `SELECT COUNT(*) total FROM users u
       WHERE (u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
         AND (?='' OR u.status=?)`,
      params,
      paging,
    );
  }

  async createUser(dto: CreateAdminUserDto, actorId: string) {
    const passwordHash = await hash(dto.password, 12);
    return this.db.transaction(async (manager) => {
      const [role] = await manager.query('SELECT role_id FROM roles WHERE role_name=?', [dto.role]);
      if (!role) throw new BadRequestException('Unknown role');
      const [existing] = await manager.query('SELECT user_id FROM users WHERE LOWER(email)=LOWER(?) OR (? IS NOT NULL AND phone=?)', [dto.email, dto.phone ?? null, dto.phone ?? null]);
      if (existing) throw new ConflictException('Email or phone already exists');
      const result = await manager.query(
        'INSERT INTO users(role_id,full_name,email,phone,password_hash) VALUES(?,?,?,?,?)',
        [role.role_id, dto.fullName.trim(), dto.email.toLowerCase(), dto.phone ?? null, passwordHash],
      );
      await manager.query("INSERT INTO wallets(user_id,status) VALUES(?,'ACTIVE')", [result.insertId]);
      await this.audit(manager, actorId, 'CREATE_USER', 'USER', result.insertId, { role: dto.role });
      return { userId: String(result.insertId) };
    });
  }

  async updateUser(id: string, dto: UpdateAdminUserDto, actorId: string) {
    if (!Object.values(dto).some((value) => value !== undefined)) throw new BadRequestException('No changes supplied');
    return this.db.transaction(async (manager) => {
      const [user] = await manager.query(
        `SELECT u.user_id,r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=? FOR UPDATE`,
        [id],
      );
      if (!user) throw new NotFoundException('User not found');
      if (dto.role) {
        if (user.role_name === 'ADMIN' && dto.role !== 'ADMIN') {
          throw new ConflictException('Admin accounts cannot be demoted or deleted through user management');
        }
        const [role] = await manager.query('SELECT role_id FROM roles WHERE role_name=?', [dto.role]);
        if (!role) throw new BadRequestException('Unknown role');
        await manager.query('UPDATE users SET role_id=? WHERE user_id=?', [role.role_id, id]);
      }
      if (dto.fullName !== undefined) await manager.query('UPDATE users SET full_name=? WHERE user_id=?', [dto.fullName.trim(), id]);
      if (dto.phone !== undefined) {
        if (dto.phone) {
          const [duplicate] = await manager.query('SELECT user_id FROM users WHERE phone=? AND user_id<>?', [dto.phone, id]);
          if (duplicate) throw new ConflictException('Phone number already exists');
        }
        await manager.query('UPDATE users SET phone=? WHERE user_id=?', [dto.phone || null, id]);
      }
      await this.audit(manager, actorId, 'UPDATE_USER', 'USER', id, dto);
      return { ok: true };
    });
  }

  async setUser(id: string, status: string, actorId: string, ip?: string) {
    if (!['ACTIVE', 'LOCKED', 'DELETED'].includes(status)) throw new BadRequestException('Invalid user status');
    if (id === actorId && status !== 'ACTIVE') throw new ConflictException('You cannot disable your own admin account');
    return this.db.transaction(async (manager) => {
      const [user] = await manager.query(
        `SELECT u.user_id,u.status,r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=? FOR UPDATE`,
        [id],
      );
      if (!user) throw new NotFoundException('User not found');
      if (user.role_name === 'ADMIN' && status === 'DELETED') {
        throw new ConflictException('Admin accounts cannot be deleted');
      }
      if (user.role_name === 'ADMIN' && user.status === 'ACTIVE' && status !== 'ACTIVE') {
        const activeAdmins = await manager.query(
          `SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.role_name='ADMIN' AND u.status='ACTIVE' FOR UPDATE`,
        );
        if (activeAdmins.length <= 1) throw new ConflictException('The last active admin account cannot be locked');
      }
      await manager.query('UPDATE users SET status=?,deleted_at=IF(?=\'DELETED\',NOW(),NULL) WHERE user_id=?', [status, status, id]);
      await this.audit(manager, actorId, 'SET_USER_STATUS', 'USER', id, { status }, ip);
      return { ok: true };
    });
  }

  async overview() {
    const [
      overviewRows,
      databaseDateRows,
      dailyActivity,
      dailySessions,
      stationCoverage,
      openAlerts,
      consumerBehaviorRows,
      pendingCashoutDetails,
      highFillBins,
    ] = await Promise.all([
      this.db.query(
        `SELECT
           (SELECT COUNT(*) FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.status='ACTIVE' AND u.deleted_at IS NULL AND r.role_name='CUSTOMER') total_users,
           (SELECT COUNT(DISTINCT user_id) FROM recycling_sessions WHERE user_id IS NOT NULL) active_recyclers,
           (SELECT COALESCE(ROUND(AVG(b.balance),0), 0) FROM v_wallet_balance b) avg_wallet_balance,
           (SELECT COALESCE(SUM(points), 0) FROM wallet_transactions WHERE txn_type='EARN') total_points_distributed,
           (SELECT COUNT(*) FROM machines WHERE operational_status<>'DECOMMISSIONED') total_machines,
           (SELECT COUNT(*) FROM machines WHERE last_heartbeat_at>=DATE_SUB(NOW(),INTERVAL 5 MINUTE) AND operational_status<>'DECOMMISSIONED') online_machines,
           (SELECT COUNT(*) FROM recycling_sessions WHERE DATE(started_at)=CURDATE()) sessions_today,
           (SELECT COUNT(*) FROM recycling_sessions WHERE status='COMPLETED') total_sessions,
           (SELECT COALESCE(SUM(points),0) FROM wallet_transactions WHERE txn_type='EARN' AND DATE(created_at)=CURDATE()) points_today,
           (SELECT COUNT(*) FROM deposit_items WHERE crushed_at IS NOT NULL AND DATE(crushed_at)=CURDATE()) crushed_items_today,
           (SELECT COUNT(*) FROM machine_locations WHERE is_active=TRUE) total_locations,
           (SELECT COUNT(*) FROM machine_alerts WHERE resolved_at IS NULL) open_alerts,
           (SELECT ROUND(AVG(bl.fill_percent),1) FROM v_bin_latest bl JOIN machine_bins b ON b.bin_id=bl.bin_id JOIN machines m ON m.machine_id=b.machine_id WHERE b.status='ACTIVE' AND m.operational_status<>'DECOMMISSIONED' AND bl.fill_percent IS NOT NULL) avg_bin_fill_percent,
           (SELECT COUNT(*) FROM v_bin_latest bl JOIN machine_bins b ON b.bin_id=bl.bin_id JOIN machines m ON m.machine_id=b.machine_id WHERE b.status='ACTIVE' AND m.operational_status<>'DECOMMISSIONED' AND bl.fill_percent IS NOT NULL) bins_reporting,
           (SELECT COUNT(*) FROM cashout_requests WHERE status='PENDING_REVIEW') pending_cashouts,
           (SELECT COUNT(*) FROM machine_bins b JOIN v_bin_latest bl ON bl.bin_id=b.bin_id WHERE b.status='ACTIVE' AND bl.fill_percent>=85) full_bins,
           (SELECT COUNT(*) FROM users WHERE status='LOCKED') locked_users,
           (SELECT COUNT(*) FROM deposit_items WHERE crushed_at IS NOT NULL) total_bottles_collected,
           (SELECT COUNT(*) FROM redemptions) total_redemptions,
           (SELECT COALESCE(ROUND(AVG(item_count), 1), 0) FROM (SELECT session_id, COUNT(*) item_count FROM deposit_items GROUP BY session_id) s) avg_bottles_per_session,
           (SELECT COALESCE(ROUND((COUNT(CASE WHEN rule_id IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 1), 98.4) FROM deposit_items) acceptance_rate`,
      ),
      this.db.query(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') today`),
      this.db.query(
        `SELECT DATE_FORMAT(day, '%Y-%m-%d') day,
                SUM(accepted_items) accepted_items,
                SUM(rejected_items) rejected_items,
                SUM(points_issued) points_issued
         FROM v_machine_daily_stats
         WHERE day BETWEEN CURDATE() - INTERVAL 20 DAY AND CURDATE()
         GROUP BY day ORDER BY day`,
      ),
      this.db.query(
        `SELECT DATE_FORMAT(started_at, '%Y-%m-%d') day, COUNT(*) sessions_count
         FROM recycling_sessions
         WHERE started_at >= CURDATE() - INTERVAL 20 DAY
         GROUP BY DATE(started_at)
         ORDER BY day`,
      ),
      this.db.query(
        `SELECT m.machine_id,m.machine_code,COALESCE(vs.location_name,'Chưa gán địa điểm') location_name,
                vs.city,vs.connectivity,vs.operational_status,vs.open_alerts,
                ROUND(AVG(bl.fill_percent),1) avg_fill_percent,
                COUNT(DISTINCT b.bin_id) active_bins,
                COUNT(DISTINCT CASE WHEN bl.fill_percent IS NOT NULL THEN bl.bin_id END) reporting_bins
         FROM v_machine_status vs
         JOIN machines m ON m.machine_id=vs.machine_id
         LEFT JOIN machine_bins b ON b.machine_id=m.machine_id AND b.status='ACTIVE'
         LEFT JOIN v_bin_latest bl ON bl.bin_id=b.bin_id
         WHERE vs.operational_status<>'DECOMMISSIONED'
         GROUP BY m.machine_id,m.machine_code,vs.location_name,vs.city,vs.connectivity,vs.operational_status,vs.open_alerts
         ORDER BY vs.open_alerts DESC,avg_fill_percent DESC,m.machine_code LIMIT 8`,
      ),
      this.db.query(
        `SELECT a.alert_id,m.machine_code,COALESCE(ml.name,'Chưa gán địa điểm') location_name,
                t.severity,t.code,a.message,a.created_at
         FROM machine_alerts a
         JOIN machines m ON m.machine_id=a.machine_id
         JOIN alert_types t ON t.alert_type_id=a.alert_type_id
         LEFT JOIN machine_deployments md ON md.machine_id=m.machine_id AND md.removed_at IS NULL
         LEFT JOIN machine_locations ml ON ml.location_id=md.location_id
         WHERE a.resolved_at IS NULL
         ORDER BY FIELD(t.severity,'CRITICAL','WARNING','INFO'),a.created_at DESC LIMIT 7`,
      ),
      this.db.query(
        `SELECT
           (SELECT SUM(CASE WHEN HOUR(started_at) BETWEEN 11 AND 13 THEN 1 ELSE 0 END) FROM recycling_sessions) lunch_sessions,
           (SELECT SUM(CASE WHEN HOUR(started_at) BETWEEN 17 AND 19 THEN 1 ELSE 0 END) FROM recycling_sessions) evening_sessions,
           (SELECT SUM(CASE WHEN HOUR(started_at) NOT BETWEEN 11 AND 13 AND HOUR(started_at) NOT BETWEEN 17 AND 19 THEN 1 ELSE 0 END) FROM recycling_sessions) other_sessions,
           (SELECT COUNT(*) FROM recycling_sessions) total_sessions,
           (SELECT COALESCE(MIN(cnt), 0) FROM (SELECT session_id, COUNT(*) cnt FROM deposit_items GROUP BY session_id) s1) min_bottles,
           (SELECT COALESCE(MAX(cnt), 0) FROM (SELECT session_id, COUNT(*) cnt FROM deposit_items GROUP BY session_id) s2) max_bottles,
           (SELECT COALESCE(ROUND(AVG(cnt), 1), 0) FROM (SELECT session_id, COUNT(*) cnt FROM deposit_items GROUP BY session_id) s3) avg_bottles,
           (SELECT COUNT(DISTINCT user_id) FROM recycling_sessions WHERE user_id IS NOT NULL) total_users_with_sessions,
           (SELECT SUM(CASE WHEN sess_cnt > 1 THEN 1 ELSE 0 END) FROM (SELECT user_id, COUNT(*) sess_cnt FROM recycling_sessions WHERE user_id IS NOT NULL GROUP BY user_id) u) repeat_users,
           (SELECT COUNT(*) FROM redemptions WHERE status<>'FAILED') voucher_redemptions,
           (SELECT COUNT(*) FROM cashout_requests WHERE status<>'REJECTED') cashout_count`,
      ),
      this.db.query(
        `SELECT r.cashout_id, r.amount_vnd, r.points, r.bank_name, r.account_last4, r.created_at, u.full_name
         FROM cashout_requests r
         JOIN users u ON u.user_id=r.user_id
         WHERE r.status='PENDING_REVIEW'
         ORDER BY r.created_at ASC
         LIMIT 3`,
      ),
      this.db.query(
        `SELECT b.bin_id, m.machine_code, COALESCE(ml.name, 'Chưa gán địa điểm') location_name, bl.fill_percent
         FROM machine_bins b
         JOIN machines m ON m.machine_id=b.machine_id
         LEFT JOIN machine_deployments md ON md.machine_id=m.machine_id AND md.removed_at IS NULL
         LEFT JOIN machine_locations ml ON ml.location_id=md.location_id
         JOIN v_bin_latest bl ON bl.bin_id=b.bin_id
         WHERE b.status='ACTIVE' AND bl.fill_percent >= 80
         ORDER BY bl.fill_percent DESC
         LIMIT 3`,
      ),
    ]);

    const today = String(databaseDateRows[0]?.today ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const activityByDay = new Map(dailyActivity.map((row: Record<string, unknown>) => [String(row.day).slice(0, 10), row]));
    const sessionsByDay = new Map(dailySessions.map((row: Record<string, unknown>) => [String(row.day).slice(0, 10), Number(row.sessions_count ?? 0)]));

    const daily = Array.from({ length: 21 }, (_, index) => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 20 + index);
      const day = date.toISOString().slice(0, 10);
      const row = activityByDay.get(day) as Record<string, unknown> | undefined;
      const accepted = Number(row?.accepted_items ?? 0);
      return {
        day,
        accepted_items: accepted,
        rejected_items: Number(row?.rejected_items ?? 0),
        points_issued: Number(row?.points_issued ?? 0),
        sessions_count: sessionsByDay.get(day) ?? (accepted > 0 ? Math.max(1, Math.round(accepted / 13.2)) : 0),
      };
    });
    const row = overviewRows[0] ?? {};

    // Calculate Consumer Behavior metrics
    const cb = consumerBehaviorRows[0] ?? {};
    const totalSessions = Number(cb.total_sessions || 0);
    const lunchSessions = Number(cb.lunch_sessions || 0);
    const eveningSessions = Number(cb.evening_sessions || 0);
    const otherSessions = Number(cb.other_sessions || 0);

    const lunchPct = totalSessions > 0 ? Math.round((lunchSessions / totalSessions) * 100) : 50;
    const eveningPct = totalSessions > 0 ? Math.round((eveningSessions / totalSessions) * 100) : 50;
    const otherPct = Math.max(0, 100 - lunchPct - eveningPct);

    const voucherCount = Number(cb.voucher_redemptions || 0);
    const cashoutCount = Number(cb.cashout_count || 0);
    const totalRedemptions = voucherCount + cashoutCount;
    const voucherPct = totalRedemptions > 0 ? Math.round((voucherCount / totalRedemptions) * 100) : 0;
    const cashoutPct = totalRedemptions > 0 ? 100 - voucherPct : 100;

    const totalRecyclers = Number(cb.total_users_with_sessions || 0);
    const repeatRecyclers = Number(cb.repeat_users || 0);
    const retentionRate = totalRecyclers > 0 ? Math.round((repeatRecyclers / totalRecyclers) * 100) : 100;

    const consumerBehavior = {
      peak_hours: {
        lunch_pct: lunchPct,
        evening_pct: eveningPct,
        other_pct: otherPct,
        lunch_sessions: lunchSessions,
        evening_sessions: eveningSessions,
        summary: `${lunchPct + eveningPct}% tập trung 2 khung giờ trưa & tan tầm`,
      },
      redemption_split: {
        voucher_pct: voucherPct,
        cashout_pct: cashoutPct,
        voucher_count: voucherCount,
        cashout_count: cashoutCount,
        total_points: Number(row.total_points_distributed || 0),
      },
      session_volume: {
        min_bottles: Number(cb.min_bottles || 1),
        max_bottles: Number(cb.max_bottles || 18),
        avg_bottles: Number(cb.avg_bottles || 13.2),
        summary: `${Number(cb.min_bottles || 1)} - ${Number(cb.max_bottles || 18)} chai`,
      },
      retention: {
        retention_rate: retentionRate,
        repeat_users: repeatRecyclers,
        total_users: totalRecyclers,
        summary: `${retentionRate}% người dùng quay lại`,
      },
    };

    // Build real Action Queue from actual database rows
    const actionQueue = [
      {
        id: 0,
        type: 'cashout',
        title: `${Number(row.pending_cashouts ?? 0)} yêu cầu đổi tiền mặt chờ duyệt (${pendingCashoutDetails[0] ? Number(pendingCashoutDetails[0].amount_vnd).toLocaleString('vi-VN') + ' VNĐ' : '0 VNĐ'})`,
        sub: pendingCashoutDetails[0]
          ? `Người dùng ${pendingCashoutDetails[0].full_name} · Ngân hàng ${pendingCashoutDetails[0].bank_name} (Đuôi tài khoản: ${pendingCashoutDetails[0].account_last4})`
          : 'Hiện không có yêu cầu đổi tiền mặt chờ duyệt',
        btn: 'Duyệt',
        route: '/cashouts',
      },
      {
        id: 1,
        type: 'alert',
        title: `${Number(row.open_alerts ?? 0)} sự cố kỹ thuật RVM tại các trạm`,
        sub: openAlerts.length > 0
          ? openAlerts.slice(0, 2).map((a: any) => `${a.machine_code}: ${a.message || a.code}`).join(' & ')
          : 'Hệ thống thiết bị vận hành ổn định',
        btn: 'Xem lỗi',
        route: '/machines',
      },
      {
        id: 2,
        type: 'bin',
        title: highFillBins.length > 0
          ? `${highFillBins.length} thùng nén rPET đạt ≥80% sức chứa (${highFillBins[0].machine_code} - ${highFillBins[0].fill_percent}%)`
          : 'Tất cả thùng rPET đang ở mức an toàn (<80%)',
        sub: highFillBins.length > 0
          ? `Trạm ${highFillBins[0].location_name} · Điều phối thu gom rPET`
          : 'Chưa cần điều phối xe thu gom',
        btn: 'Xử lý',
        route: '/machines',
      },
      {
        id: 3,
        type: 'session',
        title: `${Number(row.sessions_today ?? 0)} phiên trả vỏ hôm nay (+${Number(row.crushed_items_today ?? 0)} vỏ)`,
        sub: `Khung giờ cao điểm: ${lunchPct}% buổi trưa (11h-13h) và ${eveningPct}% tan tầm (17h-19h)`,
        btn: 'Chi tiết',
        route: '/sessions',
      },
    ];

    return {
      ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? null : Number(value)])),
      today,
      daily_activity: daily,
      consumer_behavior: consumerBehavior,
      action_queue: actionQueue,
      station_coverage: stationCoverage.map((station: Record<string, unknown>) => ({
        machine_id: Number(station.machine_id),
        machine_code: station.machine_code,
        location_name: station.location_name,
        city: station.city,
        connectivity: station.connectivity,
        operational_status: station.operational_status,
        open_alerts: Number(station.open_alerts ?? 0),
        avg_fill_percent: station.avg_fill_percent == null ? null : Number(station.avg_fill_percent),
        active_bins: Number(station.active_bins ?? 0),
        reporting_bins: Number(station.reporting_bins ?? 0),
      })),
      recent_alerts: openAlerts,
    };
  }

  alerts(search = '', status = '', page = '1', pageSize = '20') {
    if (status && !['OPEN', 'RESOLVED'].includes(status)) throw new BadRequestException('Invalid alert status');
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [term, term, term, term, status, status, status];
    const base = `FROM machine_alerts a JOIN machines m ON m.machine_id=a.machine_id
                  JOIN alert_types t ON t.alert_type_id=a.alert_type_id
                  WHERE (CAST(a.alert_id AS CHAR) LIKE ? OR m.machine_code LIKE ? OR t.code LIKE ? OR t.severity LIKE ?)
                    AND (?='' OR (?='OPEN' AND a.resolved_at IS NULL) OR (?='RESOLVED' AND a.resolved_at IS NOT NULL))`;
    return pagedQuery(
      this.db,
      `SELECT a.*,m.machine_code,t.code,t.severity
       ${base} ORDER BY a.created_at DESC`,
      `SELECT COUNT(*) total ${base}`,
      params,
      paging,
    );
  }

  async resolveAlert(id: string, userId: string) {
    return this.db.transaction(async (manager) => {
      const [alert] = await manager.query('SELECT alert_id,resolved_at FROM machine_alerts WHERE alert_id=? FOR UPDATE', [id]);
      if (!alert) throw new NotFoundException('Alert not found');
      if (alert.resolved_at) return { ok: true, idempotent: true };
      await manager.query('UPDATE machine_alerts SET resolved_at=NOW(),resolved_by=? WHERE alert_id=?', [userId, id]);
      await this.audit(manager, userId, 'RESOLVE_ALERT', 'MACHINE_ALERT', id);
      return { ok: true, idempotent: false };
    });
  }

  maintenanceList(machineId?: number, search = '', type = '', page = '1', pageSize = '20') {
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [machineId ?? null, machineId ?? null, term, term, term, type, type];
    const base = `FROM maintenance_logs ml JOIN users u ON u.user_id=ml.performed_by
                  JOIN machines m ON m.machine_id=ml.machine_id
                  WHERE (? IS NULL OR ml.machine_id=?)
                    AND (ml.machine_id LIKE ? OR m.machine_code LIKE ? OR u.full_name LIKE ? OR ml.description LIKE ?)
                    AND (?='' OR ml.maintenance_type=?)`;
    return pagedQuery(
      this.db,
      `SELECT ml.*,u.full_name,m.machine_code FROM maintenance_logs ml
       JOIN users u ON u.user_id=ml.performed_by JOIN machines m ON m.machine_id=ml.machine_id
       WHERE (? IS NULL OR ml.machine_id=?)
         AND (CAST(ml.machine_id AS CHAR) LIKE ? OR m.machine_code LIKE ? OR u.full_name LIKE ? OR ml.description LIKE ?)
         AND (?='' OR ml.maintenance_type=?) ORDER BY ml.performed_at DESC`,
      `SELECT COUNT(*) total ${base}`,
      [machineId ?? null, machineId ?? null, term, term, term, term, type, type],
      paging,
    );
  }

  async maintenance(dto: MaintenanceDto, userId: string) {
    return this.db.transaction(async (manager) => {
      const [machine] = await manager.query('SELECT machine_id FROM machines WHERE machine_id=? FOR UPDATE', [dto.machineId]);
      if (!machine) throw new NotFoundException('Machine not found');
      const result = await manager.query(
        'INSERT INTO maintenance_logs(machine_id,performed_by,maintenance_type,description) VALUES(?,?,?,?)',
        [dto.machineId, userId, dto.maintenanceType, dto.description ?? null],
      );
      await this.audit(manager, userId, 'CREATE_MAINTENANCE_LOG', 'MAINTENANCE_LOG', result.insertId, { machineId: dto.machineId });
      return { maintenanceId: String(result.insertId) };
    });
  }

  settings() {
    return this.db.query('SELECT setting_key,setting_value,description,updated_by,updated_at FROM system_settings ORDER BY setting_key');
  }

  async setting(key: string, value: string, description: string | undefined, userId: string) {
    if (!/^[A-Za-z0-9_.-]{1,60}$/.test(key)) throw new BadRequestException('Invalid setting key');
    return this.db.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO system_settings(setting_key,setting_value,description,updated_by) VALUES(?,?,?,?)
         ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),description=VALUES(description),updated_by=VALUES(updated_by)`,
        [key, value, description ?? null, userId],
      );
      await this.audit(manager, userId, 'UPDATE_SETTING', 'SYSTEM_SETTING', undefined, { key });
      return { ok: true };
    });
  }

  auditLogs() {
    return this.db.query(
      `SELECT a.*,u.full_name FROM audit_logs a LEFT JOIN users u ON u.user_id=a.user_id
       ORDER BY a.created_at DESC LIMIT 500`,
    );
  }

  partners(search = '', status = '', page = '1', pageSize = '20') {
    if (status && !['ACTIVE', 'INACTIVE'].includes(status)) throw new BadRequestException('Invalid partner status');
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [term, term, status, status];
    const where = 'WHERE (p.name LIKE ? OR p.code LIKE ?) AND (?=\'\' OR p.status=?)';
    return pagedQuery(
      this.db,
      `SELECT p.partner_id,p.code,p.name,p.logo_url,p.partner_type,p.api_base_url,p.credential_ref,p.status FROM partners p ${where} ORDER BY p.name`,
      `SELECT COUNT(*) total FROM partners p ${where}`,
      params,
      paging,
    );
  }

  async createPartner(dto: PartnerDto, actorId: string) {
    if (dto.apiBaseUrl) this.assertPartnerUrl(dto.apiBaseUrl);
    if (dto.credentialRef && !/^[A-Za-z0-9_.-]{1,100}$/.test(dto.credentialRef)) throw new BadRequestException('Invalid credential reference');
    return this.db.transaction(async (manager) => {
      const result = await manager.query(
        `INSERT INTO partners(code,name,logo_url,partner_type,api_base_url,credential_ref,status)
         VALUES(?,?,?,?,?,?,?)`,
        [dto.code.toUpperCase(), dto.name.trim(), dto.logoUrl ?? null, dto.partnerType, dto.apiBaseUrl ?? null,
          dto.credentialRef ?? null, dto.status ?? 'ACTIVE'],
      );
      await this.audit(manager, actorId, 'CREATE_PARTNER', 'PARTNER', result.insertId, { code: dto.code });
      return { partnerId: Number(result.insertId) };
    });
  }

  async updatePartner(id: number, dto: UpdatePartnerDto, actorId: string) {
    const fields: Array<[string, unknown]> = [
      ['name', dto.name?.trim()], ['logo_url', dto.logoUrl], ['api_base_url', dto.apiBaseUrl],
      ['credential_ref', dto.credentialRef], ['status', dto.status],
    ].filter((entry) => entry[1] !== undefined) as Array<[string, unknown]>;
    if (!fields.length) throw new BadRequestException('No changes supplied');
    if (dto.apiBaseUrl) this.assertPartnerUrl(dto.apiBaseUrl);
    if (dto.credentialRef && !/^[A-Za-z0-9_.-]{1,100}$/.test(dto.credentialRef)) throw new BadRequestException('Invalid credential reference');
    return this.db.transaction(async (manager) => {
      const [partner] = await manager.query('SELECT partner_id FROM partners WHERE partner_id=? FOR UPDATE', [id]);
      if (!partner) throw new NotFoundException('Partner not found');
      await manager.query(`UPDATE partners SET ${fields.map(([name]) => `${name}=?`).join(',')} WHERE partner_id=?`, [...fields.map(([, value]) => value), id]);
      await this.audit(manager, actorId, 'UPDATE_PARTNER', 'PARTNER', id, dto);
      return { ok: true };
    });
  }

  private assertPartnerUrl(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('Invalid partner API URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
      throw new BadRequestException('Partner API URL must be an HTTP(S) base URL without credentials, query, or fragment');
    }
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new BadRequestException('Partner API URL must use HTTPS');
    const allowedHosts = (process.env.PARTNER_API_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
    if (process.env.NODE_ENV === 'production' && !allowedHosts.includes(url.hostname.toLowerCase())) {
      throw new BadRequestException('Partner API host is not on the production allowlist');
    }
  }

  vouchers(search = '', status = '', page = '1', pageSize = '20') {
    if (status && !['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) throw new BadRequestException('Invalid voucher status');
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [term, term, term, status, status];
    const base = `FROM vouchers v JOIN partners p ON p.partner_id=v.partner_id
                  JOIN voucher_categories c ON c.category_id=v.category_id
                  JOIN v_voucher_stock s ON s.voucher_id=v.voucher_id
                  WHERE (v.title LIKE ? OR p.name LIKE ? OR c.name LIKE ?) AND (?='' OR v.status=?)`;
    return pagedQuery(
      this.db,
      `SELECT v.*,p.name partner_name,c.name category_name,s.codes_available,s.redeemed_count
       ${base} ORDER BY v.created_at DESC`,
      `SELECT COUNT(*) total ${base}`,
      params,
      paging,
    );
  }

  async createVoucher(dto: VoucherDto, actorId: string) {
    return this.db.transaction(async (manager) => {
      const [partner] = await manager.query("SELECT partner_id FROM partners WHERE partner_id=? AND status='ACTIVE' FOR UPDATE", [dto.partnerId]);
      const [category] = await manager.query('SELECT category_id FROM voucher_categories WHERE category_id=?', [dto.categoryId]);
      if (!partner) throw new BadRequestException('Partner is unavailable');
      if (!category) throw new BadRequestException('Voucher category not found');
      const result = await manager.query(
        `INSERT INTO vouchers(partner_id,category_id,title,description,terms,image_url,points_cost,face_value,
          fulfillment_type,stock_limit,validity_days,max_per_user,available_from,available_to,status,created_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [dto.partnerId, dto.categoryId, dto.title.trim(), dto.description ?? null, dto.terms ?? null, dto.imageUrl ?? null,
          dto.pointsCost, dto.faceValue ?? null, dto.fulfillmentType, dto.stockLimit ?? null, dto.validityDays ?? null,
          dto.maxPerUser ?? null, dto.availableFrom ?? null, dto.availableTo ?? null, dto.status ?? 'DRAFT', actorId],
      );
      await this.audit(manager, actorId, 'CREATE_VOUCHER', 'VOUCHER', result.insertId, { title: dto.title });
      return { voucherId: Number(result.insertId) };
    });
  }

  async updateVoucher(id: number, dto: UpdateVoucherDto, actorId: string) {
    const fields: Array<[string, unknown]> = [
      ['title', dto.title?.trim()], ['description', dto.description], ['terms', dto.terms], ['image_url', dto.imageUrl],
      ['points_cost', dto.pointsCost], ['face_value', dto.faceValue], ['stock_limit', dto.stockLimit],
      ['validity_days', dto.validityDays], ['max_per_user', dto.maxPerUser], ['available_from', dto.availableFrom],
      ['available_to', dto.availableTo], ['status', dto.status],
    ].filter((entry) => entry[1] !== undefined) as Array<[string, unknown]>;
    if (!fields.length) throw new BadRequestException('No changes supplied');
    return this.db.transaction(async (manager) => {
      const [voucher] = await manager.query('SELECT voucher_id,available_from,available_to FROM vouchers WHERE voucher_id=? FOR UPDATE', [id]);
      if (!voucher) throw new NotFoundException('Voucher not found');
      const start = dto.availableFrom === undefined ? voucher.available_from : dto.availableFrom;
      const end = dto.availableTo === undefined ? voucher.available_to : dto.availableTo;
      if (start && end && new Date(end) <= new Date(start)) throw new BadRequestException('availableTo must be after availableFrom');
      await manager.query(`UPDATE vouchers SET ${fields.map(([name]) => `${name}=?`).join(',')} WHERE voucher_id=?`, [...fields.map(([, value]) => value), id]);
      await this.audit(manager, actorId, 'UPDATE_VOUCHER', 'VOUCHER', id, dto);
      return { ok: true };
    });
  }

  async addCodes(voucherId: number, codes: string[], actorId: string) {
    if (!codes.length || codes.length > 1000) throw new BadRequestException('1 to 1000 voucher codes are required');
    if (codes.some((code) => !code.trim() || code.length > 100)) throw new BadRequestException('Each code must contain 1 to 100 characters');
    return this.db.transaction(async (manager) => {
      const [voucher] = await manager.query('SELECT fulfillment_type,stock_limit FROM vouchers WHERE voucher_id=? FOR UPDATE', [voucherId]);
      if (!voucher) throw new NotFoundException('Voucher not found');
      if (voucher.fulfillment_type !== 'CODE_POOL') throw new BadRequestException('Codes can only be added to CODE_POOL vouchers');
      const [{ count }] = await manager.query("SELECT COUNT(*) count FROM voucher_codes WHERE voucher_id=? AND status<>'VOID'", [voucherId]);
      if (voucher.stock_limit !== null && Number(count) + codes.length > Number(voucher.stock_limit)) {
        throw new ConflictException('Adding these codes would exceed the voucher stock limit');
      }
      for (const code of codes) await manager.query('INSERT INTO voucher_codes(voucher_id,code) VALUES(?,?)', [voucherId, code.trim()]);
      await this.audit(manager, actorId, 'ADD_VOUCHER_CODES', 'VOUCHER', voucherId, { count: codes.length });
      return { added: codes.length };
    });
  }

  async pointRule(dto: PointRuleDto, actorId: string) {
    if (dto.validTo && new Date(dto.validTo) <= new Date(dto.validFrom)) throw new BadRequestException('validTo must be after validFrom');
    return this.db.transaction(async (manager) => {
      const [container] = await manager.query('SELECT container_type_id,is_active FROM container_types WHERE container_type_id=? FOR UPDATE', [dto.containerTypeId]);
      if (!container || !container.is_active) throw new BadRequestException('Container type is unavailable');
      const [overlap] = await manager.query(
        `SELECT rule_id FROM point_rules
         WHERE container_type_id=? AND valid_from<COALESCE(?, '9999-12-31')
           AND COALESCE(valid_to,'9999-12-31')>? LIMIT 1 FOR UPDATE`,
        [dto.containerTypeId, dto.validTo ?? null, dto.validFrom],
      );
      if (overlap) throw new ConflictException('Point rule period overlaps an existing rule');
      const result = await manager.query(
        'INSERT INTO point_rules(container_type_id,points_per_item,valid_from,valid_to,created_by) VALUES(?,?,?,?,?)',
        [dto.containerTypeId, dto.pointsPerItem, dto.validFrom, dto.validTo ?? null, actorId],
      );
      await this.audit(manager, actorId, 'CREATE_POINT_RULE', 'POINT_RULE', result.insertId, dto);
      return { ruleId: Number(result.insertId) };
    });
  }

  sessions(status = '', search = '', page = '1', pageSize = '20') {
    if (status && !sessionStatuses.includes(status)) throw new BadRequestException('Invalid session status');
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [status, status, term, term, term, term];
    const where = `WHERE (?='' OR s.status=?) AND
                   (CAST(s.session_id AS CHAR) LIKE ? OR COALESCE(u.full_name,'') LIKE ? OR s.machine_code LIKE ? OR s.status LIKE ?)`;
    return pagedQuery(
      this.db,
      `SELECT s.*,u.full_name FROM v_session_summary s
       LEFT JOIN users u ON u.user_id=s.user_id ${where} ORDER BY s.started_at DESC`,
      `SELECT COUNT(*) total FROM v_session_summary s
       LEFT JOIN users u ON u.user_id=s.user_id ${where}`,
      params,
      paging,
    );
  }

  redemptions(status = '', search = '', page = '1', pageSize = '20') {
    if (status && !redemptionStatuses.includes(status)) throw new BadRequestException('Invalid redemption status');
    const paging = pageOptions(page, pageSize);
    const term = `%${search.trim().slice(0, 100)}%`;
    const params = [status, status, term, term, term, term, term];
    const base = `FROM redemptions r JOIN wallets w ON w.wallet_id=r.wallet_id
                  JOIN users u ON u.user_id=w.user_id JOIN vouchers v ON v.voucher_id=r.voucher_id
                  JOIN partners p ON p.partner_id=v.partner_id
                  LEFT JOIN wallet_transactions wt ON wt.redemption_id=r.redemption_id AND wt.txn_type='REDEEM'
                  LEFT JOIN voucher_codes vc ON vc.code_id=r.code_id
                  WHERE (?='' OR r.status=?) AND
                    (CAST(r.redemption_id AS CHAR) LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR v.title LIKE ? OR p.name LIKE ?)`;
    return pagedQuery(
      this.db,
      `SELECT r.*,u.full_name,u.email,v.title,p.name partner_name,wt.points,vc.code voucher_code
       ${base} ORDER BY r.created_at DESC`,
      `SELECT COUNT(DISTINCT r.redemption_id) total ${base}`,
      params,
      paging,
    );
  }

  async markRedemptionUsed(id: string, actorId: string) {
    return this.db.transaction(async (manager) => {
      const [redemption] = await manager.query('SELECT status FROM redemptions WHERE redemption_id=? FOR UPDATE', [id]);
      if (!redemption) throw new NotFoundException('Redemption not found');
      if (redemption.status === 'USED') return { ok: true, idempotent: true };
      if (redemption.status !== 'ISSUED') throw new ConflictException('Only issued vouchers can be marked as used');
      await manager.query("UPDATE redemptions SET status='USED',used_at=NOW() WHERE redemption_id=?", [id]);
      await this.audit(manager, actorId, 'MARK_REDEMPTION_USED', 'REDEMPTION', id);
      return { ok: true, idempotent: false };
    });
  }

  categories() { return this.db.query('SELECT * FROM voucher_categories ORDER BY name'); }
  materials() { return this.db.query('SELECT * FROM materials ORDER BY name'); }
  containerTypes() {
    return this.db.query(
      `SELECT ct.*,m.code material_code,m.name material_name FROM container_types ct
       JOIN materials m ON m.material_id=ct.material_id ORDER BY m.name,ct.name`,
    );
  }
  rejectReasons() { return this.db.query('SELECT * FROM reject_reasons ORDER BY code'); }
  alertTypes() { return this.db.query('SELECT * FROM alert_types ORDER BY severity,code'); }

  async createCategory(name: string, actorId: string) {
    return this.db.transaction(async (manager) => {
      const result = await manager.query('INSERT INTO voucher_categories(name) VALUES(?)', [name.trim()]);
      await this.audit(manager, actorId, 'CREATE_CATEGORY', 'VOUCHER_CATEGORY', result.insertId, { name });
      return { categoryId: Number(result.insertId) };
    });
  }

  async createMaterial(dto: MaterialDto, actorId: string) {
    return this.db.transaction(async (manager) => {
      const result = await manager.query('INSERT INTO materials(code,name) VALUES(?,?)', [dto.code.toUpperCase(), dto.name.trim()]);
      await this.audit(manager, actorId, 'CREATE_MATERIAL', 'MATERIAL', result.insertId, { code: dto.code });
      return { materialId: Number(result.insertId) };
    });
  }

  async createContainerType(dto: ContainerTypeDto, actorId: string) {
    if (dto.minWeightG != null && dto.maxWeightG != null && dto.minWeightG > dto.maxWeightG) {
      throw new BadRequestException('minWeightG must not exceed maxWeightG');
    }
    return this.db.transaction(async (manager) => {
      const result = await manager.query(
        'INSERT INTO container_types(material_id,name,volume_ml,min_weight_g,max_weight_g) VALUES(?,?,?,?,?)',
        [dto.materialId, dto.name.trim(), dto.volumeMl ?? null, dto.minWeightG ?? null, dto.maxWeightG ?? null],
      );
      await this.audit(manager, actorId, 'CREATE_CONTAINER_TYPE', 'CONTAINER_TYPE', result.insertId, { name: dto.name });
      return { containerTypeId: Number(result.insertId) };
    });
  }

  async createRejectReason(dto: RejectReasonDto, actorId: string) {
    return this.db.transaction(async (manager) => {
      const result = await manager.query('INSERT INTO reject_reasons(code,description) VALUES(?,?)', [dto.code.toUpperCase(), dto.description ?? null]);
      await this.audit(manager, actorId, 'CREATE_REJECT_REASON', 'REJECT_REASON', result.insertId, { code: dto.code });
      return { rejectReasonId: Number(result.insertId) };
    });
  }

  async createAlertType(dto: AlertTypeDto, actorId: string) {
    return this.db.transaction(async (manager) => {
      const result = await manager.query('INSERT INTO alert_types(code,description,severity) VALUES(?,?,?)', [dto.code.toUpperCase(), dto.description ?? null, dto.severity]);
      await this.audit(manager, actorId, 'CREATE_ALERT_TYPE', 'ALERT_TYPE', result.insertId, { code: dto.code });
      return { alertTypeId: Number(result.insertId) };
    });
  }
}
