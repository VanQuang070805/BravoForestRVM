import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { RedeemDto } from './rewards.dto';
import { pageOptions, pagedQuery } from '../../common/pagination';

@Injectable()
export class RewardsService {
  constructor(private readonly db: DataSource, @InjectQueue('bravoforest') private readonly queue: Queue) {}

  async catalog(search = '', category = '', page = '1', pageSize = '12') {
    const paging = pageOptions(page, pageSize);
    const trimmedSearch = search.trim().slice(0, 100);
    const term = `%${trimmedSearch}%`;
    const activeOnly = `v.status='ACTIVE' AND (v.available_from IS NULL OR v.available_from<=NOW())
      AND (v.available_to IS NULL OR v.available_to>NOW())
      AND (v.stock_limit IS NULL OR s.redeemed_count<v.stock_limit)
      AND (v.fulfillment_type<>'CODE_POOL' OR s.codes_available>0)`;
    const where = `${activeOnly}
      AND (?='' OR v.title LIKE ? OR v.description LIKE ? OR p.name LIKE ? OR c.name LIKE ?)
      AND (?='' OR c.name=?)`;
    const result = await pagedQuery(
      this.db,
      `SELECT v.*,p.name partner_name,p.logo_url,c.name category_name,
              s.codes_available,s.redeemed_count,
              CASE WHEN v.stock_limit IS NULL OR s.redeemed_count < v.stock_limit THEN 1 ELSE 0 END in_stock
       FROM vouchers v JOIN partners p ON p.partner_id=v.partner_id
       JOIN voucher_categories c ON c.category_id=v.category_id
       JOIN v_voucher_stock s ON s.voucher_id=v.voucher_id
       WHERE ${where} ORDER BY v.created_at DESC`,
      `SELECT COUNT(*) total FROM vouchers v JOIN partners p ON p.partner_id=v.partner_id
       JOIN voucher_categories c ON c.category_id=v.category_id
       JOIN v_voucher_stock s ON s.voucher_id=v.voucher_id WHERE ${where}`,
      [trimmedSearch, term, term, term, term, category, category],
      paging,
    );
    const categoryRows = await this.db.query(
      `SELECT DISTINCT c.name FROM vouchers v JOIN voucher_categories c ON c.category_id=v.category_id
       JOIN v_voucher_stock s ON s.voucher_id=v.voucher_id WHERE ${activeOnly} ORDER BY c.name`,
    );
    return { ...result, categories: categoryRows.map((row: { name: string }) => row.name) };
  }

  async redeem(userId: string, dto: RedeemDto) {
    const prior = await this.findIdempotent(dto.idempotencyKey, userId);
    if (prior) return prior;

    let result: { redemptionId: string; status: string; idempotent?: boolean; fulfillmentType?: string };
    try {
      result = await this.db.transaction(async (manager) => {
        const [wallet] = await manager.query('SELECT wallet_id,status FROM wallets WHERE user_id=? FOR UPDATE', [userId]);
        if (!wallet || wallet.status !== 'ACTIVE') throw new ConflictException('Wallet unavailable');

        const [existing] = await manager.query(
          `SELECT r.redemption_id,r.status,w.user_id FROM redemptions r
           JOIN wallets w ON w.wallet_id=r.wallet_id WHERE r.idempotency_key=? FOR UPDATE`,
          [dto.idempotencyKey],
        );
        if (existing) {
          if (String(existing.user_id) !== userId) throw new ConflictException('Idempotency key already belongs to another account');
          return { redemptionId: String(existing.redemption_id), status: existing.status, idempotent: true };
        }

        const [voucher] = await manager.query(
          `SELECT * FROM vouchers WHERE voucher_id=? AND status='ACTIVE'
           AND (available_from IS NULL OR available_from<=NOW())
           AND (available_to IS NULL OR available_to>NOW()) FOR UPDATE`,
          [dto.voucherId],
        );
        if (!voucher) throw new NotFoundException('Voucher unavailable');

        const [{ balance }] = await manager.query('SELECT COALESCE(SUM(points),0) balance FROM wallet_transactions WHERE wallet_id=?', [wallet.wallet_id]);
        if (Number(balance) < Number(voucher.points_cost)) throw new BadRequestException('Insufficient points');

        const [{ count: stockUsed }] = await manager.query(
          "SELECT COUNT(*) count FROM redemptions WHERE voucher_id=? AND status IN ('PENDING','ISSUED','USED')",
          [dto.voucherId],
        );
        if (voucher.stock_limit !== null && Number(stockUsed) >= Number(voucher.stock_limit)) {
          throw new ConflictException('Voucher out of stock');
        }

        if (voucher.max_per_user) {
          const [{ count }] = await manager.query(
            `SELECT COUNT(*) count FROM redemptions
             WHERE wallet_id=? AND voucher_id=? AND status IN ('PENDING','ISSUED','USED')`,
            [wallet.wallet_id, dto.voucherId],
          );
          if (Number(count) >= Number(voucher.max_per_user)) throw new ConflictException('Per-user limit reached');
        }

        let codeId: string | null = null;
        if (voucher.fulfillment_type === 'CODE_POOL') {
          const [code] = await manager.query(
            `SELECT code_id FROM voucher_codes WHERE voucher_id=? AND status='AVAILABLE'
             AND (expires_at IS NULL OR expires_at>NOW()) ORDER BY code_id LIMIT 1 FOR UPDATE`,
            [dto.voucherId],
          );
          if (!code) throw new ConflictException('Voucher out of stock');
          codeId = String(code.code_id);
          const reserved = await manager.query("UPDATE voucher_codes SET status='RESERVED' WHERE code_id=? AND status='AVAILABLE'", [codeId]);
          if (!reserved.affectedRows) throw new ConflictException('Voucher code was reserved by another request');
        }

        if (voucher.fulfillment_type === 'ACCOUNT_TOPUP' && !dto.linkId) {
          throw new BadRequestException('Partner link is required');
        }
        if (dto.linkId) {
          const [link] = await manager.query(
            `SELECT link_id FROM user_partner_links
             WHERE link_id=? AND user_id=? AND partner_id=? AND status='ACTIVE' FOR UPDATE`,
            [dto.linkId, userId, voucher.partner_id],
          );
          if (!link) throw new BadRequestException('Invalid partner link');
        }

        const redemption = await manager.query(
          `INSERT INTO redemptions(wallet_id,voucher_id,code_id,link_id,status,idempotency_key,expires_at)
           VALUES(?,?,?,?,'PENDING',?,IF(? IS NULL,NULL,DATE_ADD(NOW(),INTERVAL ? DAY)))`,
          [wallet.wallet_id, dto.voucherId, codeId, dto.linkId ?? null, dto.idempotencyKey,
            voucher.validity_days ?? null, voucher.validity_days ?? null],
        );
        await manager.query(
          "INSERT INTO wallet_transactions(wallet_id,txn_type,points,redemption_id,note) VALUES(?,'REDEEM',?,?,?)",
          [wallet.wallet_id, -Number(voucher.points_cost), redemption.insertId, `Redeem: ${voucher.title}`],
        );
        return {
          redemptionId: String(redemption.insertId),
          status: 'PENDING',
          fulfillmentType: voucher.fulfillment_type,
          idempotent: false,
        };
      });
    } catch (error) {
      const duplicate = await this.findIdempotent(dto.idempotencyKey, userId);
      if (duplicate) return duplicate;
      throw error;
    }

    if (!result.idempotent) {
      try {
        await this.queue.add(
          'fulfill-redemption',
          { redemptionId: result.redemptionId },
          { jobId: `redemption-${result.redemptionId}`, attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100 },
        );
      } catch {
        await this.failAndRefund(result.redemptionId, 'Could not enqueue voucher fulfillment');
        throw new ServiceUnavailableException('Voucher redemption was reversed because the worker queue is unavailable');
      }
    }
    return result;
  }

  history(userId: string) {
    return this.db.query('SELECT * FROM v_user_redemption_history WHERE user_id=? ORDER BY created_at DESC', [userId]);
  }

  wallet(userId: string) {
    return this.db.query('SELECT * FROM v_user_point_history WHERE user_id=? ORDER BY created_at DESC', [userId]);
  }

  async findIdempotent(key: string, userId: string) {
    const [row] = await this.db.query(
      `SELECT r.redemption_id,r.status,w.user_id FROM redemptions r
       JOIN wallets w ON w.wallet_id=r.wallet_id WHERE r.idempotency_key=?`,
      [key],
    );
    if (!row) return null;
    if (String(row.user_id) !== userId) throw new ConflictException('Idempotency key already belongs to another account');
    return { redemptionId: String(row.redemption_id), status: row.status, idempotent: true };
  }

  async failAndRefund(redemptionId: string, reason: string) {
    return this.db.transaction(async (manager) => {
      const [redemption] = await manager.query(
        `SELECT r.*,w.wallet_id FROM redemptions r JOIN wallets w ON w.wallet_id=r.wallet_id
         WHERE r.redemption_id=? FOR UPDATE`,
        [redemptionId],
      );
      if (!redemption || redemption.status !== 'PENDING') return { refunded: false };
      await manager.query("UPDATE redemptions SET status='FAILED',failure_reason=? WHERE redemption_id=?", [reason.slice(0, 255), redemptionId]);
      if (redemption.code_id) {
        await manager.query("UPDATE voucher_codes SET status='AVAILABLE' WHERE code_id=? AND status='RESERVED'", [redemption.code_id]);
      }
      const [debit] = await manager.query(
        "SELECT -points points FROM wallet_transactions WHERE redemption_id=? AND txn_type='REDEEM'",
        [redemptionId],
      );
      if (debit && Number(debit.points) > 0) {
        await manager.query(
          "INSERT INTO wallet_transactions(wallet_id,txn_type,points,redemption_id,note) VALUES(?,'REFUND',?,?,?)",
          [redemption.wallet_id, Number(debit.points), redemptionId, reason.slice(0, 255)],
        );
      }
      return { refunded: true };
    });
  }
}
