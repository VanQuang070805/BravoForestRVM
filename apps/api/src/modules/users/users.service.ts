import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(private readonly db: DataSource) {}

  async dashboard(userId: string) {
    const [profile] = await this.db.query(
      `SELECT u.user_id,u.full_name,u.email,u.phone,u.status,u.created_at,r.role_name,
              w.wallet_id,w.status wallet_status,COALESCE(b.balance,0) balance,
              COALESCE(b.total_in,0) total_in,COALESCE(b.total_out,0) total_out
       FROM users u JOIN roles r ON r.role_id=u.role_id
       LEFT JOIN wallets w ON w.user_id=u.user_id
       LEFT JOIN v_wallet_balance b ON b.user_id=u.user_id WHERE u.user_id=?`,
      [userId],
    );
    if (!profile) throw new NotFoundException();
    const [stats] = await this.db.query(
      `SELECT COUNT(*) sessions,
              COALESCE(SUM(items_accepted),0) items_accepted,
              COALESCE(SUM(items_rejected),0) items_rejected,
              COALESCE(SUM(points_credited),0) points_earned
       FROM v_session_summary WHERE user_id=?`,
      [userId],
    );
    return { ...profile, recycling: stats };
  }

  wallet(userId: string) {
    return this.db.query('SELECT * FROM v_wallet_balance WHERE user_id=?', [userId]).then((rows) => rows[0] ?? null);
  }

  ledger(userId: string, limit: number, offset: number) {
    return this.db.query(
      'SELECT * FROM v_user_point_history WHERE user_id=? ORDER BY created_at DESC,transaction_id DESC LIMIT ? OFFSET ?',
      [userId, limit, offset],
    );
  }

  returns(userId: string, limit: number, offset: number) {
    return this.db.query(
      'SELECT * FROM v_session_summary WHERE user_id=? ORDER BY started_at DESC,session_id DESC LIMIT ? OFFSET ?',
      [userId, limit, offset],
    );
  }

  notifications(userId: string) {
    return this.db.query('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [userId]);
  }

  async markNotificationRead(userId: string, id: string) {
    const result = await this.db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE notification_id=? AND user_id=?',
      [id, userId],
    );
    if (!result.affectedRows) throw new NotFoundException();
    return { ok: true };
  }
}
