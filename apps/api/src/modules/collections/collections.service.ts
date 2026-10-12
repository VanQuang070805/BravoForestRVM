import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
@Injectable() export class CollectionsService { constructor(private readonly db:DataSource){}
  bins(){return this.db.query(`SELECT b.*,m.machine_code,mt.code material_code,mt.name material_name,
    latest.fill_percent,latest.weight_kg,latest.recorded_at,since.items_since_collection,since.weight_g_since_collection
    FROM machine_bins b JOIN machines m ON m.machine_id=b.machine_id JOIN materials mt ON mt.material_id=b.material_id
    LEFT JOIN v_bin_latest latest ON latest.bin_id=b.bin_id LEFT JOIN v_bin_since_collection since ON since.bin_id=b.bin_id
    ORDER BY m.machine_code,mt.code`);}
  history(binId?:number){return this.db.query(`SELECT c.*,m.machine_code,mt.name material_name,u.full_name collected_by_name
    FROM bin_collections c JOIN machine_bins b ON b.bin_id=c.bin_id JOIN machines m ON m.machine_id=b.machine_id
    JOIN materials mt ON mt.material_id=b.material_id JOIN users u ON u.user_id=c.collected_by
    WHERE (? IS NULL OR c.bin_id=?) ORDER BY c.collected_at DESC LIMIT 500`,[binId??null,binId??null]);}
  record(binId:number,userId:string,weightKg?:number,note?:string){return this.db.transaction(async m=>{const [bin]=await m.query("SELECT bin_id,status FROM machine_bins WHERE bin_id=? FOR UPDATE",[binId]);if(!bin)throw new NotFoundException();if(bin.status!=='ACTIVE')throw new ConflictException('Bin is disabled');const r=await m.query('INSERT INTO bin_collections(bin_id,collected_by,weight_kg,note) VALUES(?,?,?,?)',[binId,userId,weightKg??null,note??null]);await m.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail) VALUES(?,'COLLECT_BIN','MACHINE_BIN',?,?)",[userId,binId,JSON.stringify({collectionId:String(r.insertId),weightKg})]);return {collectionId:String(r.insertId)};});}
}
