import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
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

  users(search = '') {
    const term = `%${search.trim()}%`;
    return this.db.query(
      `SELECT u.user_id,u.full_name,u.email,u.phone,u.status,u.created_at,r.role_name,
              w.wallet_id,COALESCE(b.balance,0) balance
       FROM users u JOIN roles r ON r.role_id=u.role_id
       LEFT JOIN wallets w ON w.user_id=u.user_id
       LEFT JOIN v_wallet_balance b ON b.wallet_id=w.wallet_id
       WHERE u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?
       ORDER BY u.created_at DESC LIMIT 200`,
      [term, term, term],
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
      const [user] = await manager.query('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [id]);
      if (!user) throw new NotFoundException('User not found');
      if (dto.role) {
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
      const [user] = await manager.query('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [id]);
      if (!user) throw new NotFoundException('User not found');
      await manager.query('UPDATE users SET status=?,deleted_at=IF(?=\'DELETED\',NOW(),NULL) WHERE user_id=?', [status, status, id]);
      await this.audit(manager, actorId, 'SET_USER_STATUS', 'USER', id, { status }, ip);
      return { ok: true };
    });
  }

  async overview() {
    const [row] = await this.db.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE status='ACTIVE') total_users,
         (SELECT COUNT(*) FROM machines WHERE operational_status<>'DECOMMISSIONED') total_machines,
         (SELECT COUNT(*) FROM v_machine_status WHERE connectivity COLLATE utf8mb4_unicode_ci='ONLINE' COLLATE utf8mb4_unicode_ci) online_machines,
         (SELECT COUNT(*) FROM recycling_sessions WHERE DATE(started_at)=CURDATE()) sessions_today,
         (SELECT COALESCE(SUM(points),0) FROM wallet_transactions WHERE txn_type='EARN' AND DATE(created_at)=CURDATE()) points_today,
         (SELECT COUNT(*) FROM machine_alerts WHERE resolved_at IS NULL) open_alerts,
         (SELECT COUNT(*) FROM deposit_items WHERE crushed_at IS NOT NULL AND DATE(crushed_at)=CURDATE()) crushed_items_today`,
    );
    return Object.fromEntries(Object.entries(row ?? {}).map(([key, value]) => [key, Number(value)]));
  }

  daily(from: string, to: string) {
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
    if (!validDate(from) || !validDate(to) || from > to) throw new BadRequestException('Invalid date range');
    return this.db.query('SELECT * FROM v_machine_daily_stats WHERE day BETWEEN ? AND ? ORDER BY day DESC,machine_code', [from, to]);
  }

  alerts() {
    return this.db.query(
      `SELECT a.*,m.machine_code,t.code,t.severity
       FROM machine_alerts a JOIN machines m ON m.machine_id=a.machine_id
       JOIN alert_types t ON t.alert_type_id=a.alert_type_id
       ORDER BY a.created_at DESC LIMIT 500`,
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

  maintenanceList(machineId?: number) {
    return this.db.query(
      `SELECT ml.*,u.full_name,m.machine_code FROM maintenance_logs ml
       JOIN users u ON u.user_id=ml.performed_by JOIN machines m ON m.machine_id=ml.machine_id
       WHERE (? IS NULL OR ml.machine_id=?) ORDER BY ml.performed_at DESC LIMIT 500`,
      [machineId ?? null, machineId ?? null],
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
    return this.db.query('SELECT setting_key,setting_value,description,updated_by FROM system_settings ORDER BY setting_key');
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

  partners() {
    return this.db.query('SELECT partner_id,code,name,logo_url,partner_type,api_base_url,credential_ref,status FROM partners ORDER BY name');
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

  vouchers() {
    return this.db.query(
      `SELECT v.*,p.name partner_name,c.name category_name,s.codes_available,s.redeemed_count
       FROM vouchers v JOIN partners p ON p.partner_id=v.partner_id
       JOIN voucher_categories c ON c.category_id=v.category_id
       JOIN v_voucher_stock s ON s.voucher_id=v.voucher_id ORDER BY v.created_at DESC`,
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

  sessions(status?: string) {
    if (status && !sessionStatuses.includes(status)) throw new BadRequestException('Invalid session status');
    return this.db.query('SELECT * FROM v_session_summary WHERE (? IS NULL OR status=?) ORDER BY started_at DESC LIMIT 500', [status ?? null, status ?? null]);
  }

  redemptions(status?: string) {
    if (status && !redemptionStatuses.includes(status)) throw new BadRequestException('Invalid redemption status');
    return this.db.query(
      `SELECT r.*,u.full_name,u.email,v.title,p.name partner_name,wt.points,vc.code voucher_code
       FROM redemptions r JOIN wallets w ON w.wallet_id=r.wallet_id
       JOIN users u ON u.user_id=w.user_id JOIN vouchers v ON v.voucher_id=r.voucher_id
       JOIN partners p ON p.partner_id=v.partner_id
       LEFT JOIN wallet_transactions wt ON wt.redemption_id=r.redemption_id AND wt.txn_type='REDEEM'
       LEFT JOIN voucher_codes vc ON vc.code_id=r.code_id
       WHERE (? IS NULL OR r.status=?) ORDER BY r.created_at DESC LIMIT 500`,
      [status ?? null, status ?? null],
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
