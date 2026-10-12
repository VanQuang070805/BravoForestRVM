import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PointsService {
  constructor(private readonly db: DataSource) {}

  catalog() {
    return this.db.query(
      `SELECT ct.*,m.code material_code,m.name material_name,
              pr.rule_id,pr.points_per_item,pr.valid_from,pr.valid_to
       FROM container_types ct JOIN materials m ON m.material_id=ct.material_id
       LEFT JOIN point_rules pr ON pr.container_type_id=ct.container_type_id
         AND pr.valid_from<=NOW() AND (pr.valid_to IS NULL OR pr.valid_to>NOW())
       WHERE ct.is_active=1 ORDER BY m.code,ct.name`,
    );
  }

  rules() {
    return this.db.query(
      `SELECT pr.*,ct.name container_type,m.code material_code,m.name material_name,u.full_name created_by_name
       FROM point_rules pr JOIN container_types ct ON ct.container_type_id=pr.container_type_id
       JOIN materials m ON m.material_id=ct.material_id
       LEFT JOIN users u ON u.user_id=pr.created_by
       ORDER BY pr.valid_from DESC,pr.rule_id DESC`,
    );
  }

  async adjust(userId: string, points: number, note: string, actorId: string) {
    if (!Number.isInteger(points) || points === 0) throw new BadRequestException('Points must be a non-zero integer');
    return this.db.transaction(async (manager) => {
      const [wallet] = await manager.query('SELECT wallet_id,status FROM wallets WHERE user_id=? FOR UPDATE', [userId]);
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.status !== 'ACTIVE') throw new ConflictException('Wallet is frozen');
      const [{ balance }] = await manager.query('SELECT COALESCE(SUM(points),0) balance FROM wallet_transactions WHERE wallet_id=?', [wallet.wallet_id]);
      if (Number(balance) + points < 0) throw new ConflictException('Adjustment would make the wallet balance negative');

      const result = await manager.query(
        `INSERT INTO wallet_transactions(wallet_id,txn_type,points,created_by,note)
         VALUES(?,'ADJUST',?,?,?)`,
        [wallet.wallet_id, points, actorId, note.trim()],
      );
      await manager.query(
        `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
         VALUES(?,'ADJUST_POINTS','WALLET',?,?)`,
        [actorId, wallet.wallet_id, JSON.stringify({ targetUserId: userId, points, transactionId: String(result.insertId) })],
      );
      return { transactionId: String(result.insertId), balance: Number(balance) + points };
    });
  }

  async walletStatus(userId: string, status: 'ACTIVE' | 'FROZEN', actorId: string) {
    return this.db.transaction(async (manager) => {
      const [wallet] = await manager.query('SELECT wallet_id,status FROM wallets WHERE user_id=? FOR UPDATE', [userId]);
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.status === status) return { ok: true, idempotent: true };
      await manager.query('UPDATE wallets SET status=? WHERE wallet_id=?', [status, wallet.wallet_id]);
      await manager.query(
        `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
         VALUES(?,'SET_WALLET_STATUS','WALLET',?,?)`,
        [actorId, wallet.wallet_id, JSON.stringify({ targetUserId: userId, status })],
      );
      return { ok: true, idempotent: false };
    });
  }

  async closeRule(ruleId: number, validTo: string, actorId: string) {
    return this.db.transaction(async (manager) => {
      const [rule] = await manager.query('SELECT * FROM point_rules WHERE rule_id=? FOR UPDATE', [ruleId]);
      if (!rule) throw new NotFoundException('Point rule not found');
      const closeDate = new Date(validTo);
      if (closeDate <= new Date(rule.valid_from)) throw new BadRequestException('validTo must be after validFrom');
      if (rule.valid_to && closeDate > new Date(rule.valid_to)) throw new ConflictException('A closed point rule cannot be extended');
      const [next] = await manager.query(
        `SELECT rule_id,valid_from FROM point_rules
         WHERE container_type_id=? AND rule_id<>? AND valid_from>=? ORDER BY valid_from LIMIT 1 FOR UPDATE`,
        [rule.container_type_id, ruleId, rule.valid_from],
      );
      if (next && closeDate > new Date(next.valid_from)) throw new ConflictException('The close date overlaps the next point rule');
      await manager.query('UPDATE point_rules SET valid_to=? WHERE rule_id=?', [validTo, ruleId]);
      await manager.query(
        `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
         VALUES(?,'CLOSE_POINT_RULE','POINT_RULE',?,?)`,
        [actorId, ruleId, JSON.stringify({ validTo })],
      );
      return { ok: true };
    });
  }
}
