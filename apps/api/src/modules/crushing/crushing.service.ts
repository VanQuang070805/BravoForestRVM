import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CrushingService {
  constructor(private readonly db: DataSource) {}

  async mark(machineId: number, sessionId: string, itemIds: string[]) {
    if (!itemIds.length || itemIds.length > 100 || itemIds.some((id) => !/^[1-9]\d{0,19}$/.test(id))) {
      throw new BadRequestException('itemIds must contain 1 to 100 valid item IDs');
    }
    if (new Set(itemIds).size !== itemIds.length) throw new BadRequestException('itemIds cannot contain duplicates');

    return this.db.transaction(async (manager) => {
      const [session] = await manager.query(
        `SELECT rs.session_id FROM recycling_sessions rs
         JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
         WHERE rs.session_id=? AND md.machine_id=? FOR UPDATE`,
        [sessionId, machineId],
      );
      if (!session) throw new BadRequestException('Session does not belong to machine');

      const placeholders = itemIds.map(() => '?').join(',');
      const invalidItems = await manager.query(
        `SELECT item_id FROM deposit_items
         WHERE item_id IN (${placeholders}) AND (session_id<>? OR rule_id IS NULL)`,
        [...itemIds, sessionId],
      );
      const matchedItems = await manager.query(
        `SELECT item_id FROM deposit_items WHERE item_id IN (${placeholders}) AND session_id=?`,
        [...itemIds, sessionId],
      );
      if (invalidItems.length || matchedItems.length !== itemIds.length) {
        throw new BadRequestException('Only existing accepted items from this session can be crushed');
      }

      const itemsWithoutCrusher = await manager.query(
        `SELECT di.item_id FROM deposit_items di
         JOIN point_rules pr ON pr.rule_id=di.rule_id
         JOIN container_types ct ON ct.container_type_id=pr.container_type_id
         LEFT JOIN machine_bins b ON b.machine_id=? AND b.material_id=ct.material_id
           AND b.processing='CRUSH' AND b.status='ACTIVE'
         WHERE di.item_id IN (${placeholders}) AND b.bin_id IS NULL`,
        [machineId, ...itemIds],
      );
      if (itemsWithoutCrusher.length) throw new BadRequestException('No active crusher bin is configured for an accepted item material');

      const result = await manager.query(
        `UPDATE deposit_items SET crushed_at=COALESCE(crushed_at,NOW())
         WHERE session_id=? AND rule_id IS NOT NULL AND item_id IN (${placeholders})`,
        [sessionId, ...itemIds],
      );
      return { updated: Number(result.affectedRows), itemCount: itemIds.length };
    });
  }
}
