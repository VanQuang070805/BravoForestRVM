import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { hash } from 'bcrypt';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { CreateLocationDto, CreateMachineBinDto, CreateMachineDto, HeartbeatDto, TelemetryDto, UpdateMachineBinDto, UpdateMachineDto } from './machines.dto';

@Injectable()
export class MachinesService {
  private readonly logger = new Logger(MachinesService.name);
  constructor(private readonly db: DataSource) {}

  async list() {
    return this.db.query(
      `SELECT s.*,
              COALESCE(b.active_bins,0) active_bins,
              COALESCE(c.crushed_items,0) crushed_items,
              COALESCE(c.crushed_weight_g,0) crushed_weight_g
       FROM v_machine_status s
       LEFT JOIN (SELECT machine_id,COUNT(*) active_bins FROM machine_bins WHERE status='ACTIVE' GROUP BY machine_id) b
         ON b.machine_id=s.machine_id
       LEFT JOIN (SELECT md.machine_id,COUNT(di.crushed_at) crushed_items,SUM(CASE WHEN di.crushed_at IS NOT NULL THEN di.measured_weight_g ELSE 0 END) crushed_weight_g
                  FROM machine_deployments md JOIN recycling_sessions rs ON rs.deployment_id=md.deployment_id
                  JOIN deposit_items di ON di.session_id=rs.session_id GROUP BY md.machine_id) c
         ON c.machine_id=s.machine_id
       ORDER BY s.machine_code`,
    );
  }

  async map() {
    return this.db.query(
      `SELECT l.location_id,l.name,l.address,l.ward,l.district,l.city,l.latitude,l.longitude,
              COUNT(DISTINCT m.machine_id) machine_count,
              SUM(CASE WHEN m.operational_status='ACTIVE' THEN 1 ELSE 0 END) active_machines,
              SUM(CASE WHEN m.last_heartbeat_at>=NOW()-INTERVAL 5 MINUTE THEN 1 ELSE 0 END) online_machines
       FROM machine_locations l
       LEFT JOIN machine_deployments md ON md.location_id=l.location_id AND md.removed_at IS NULL
       LEFT JOIN machines m ON m.machine_id=md.machine_id
       WHERE l.is_active=1
       GROUP BY l.location_id,l.name,l.address,l.ward,l.district,l.city,l.latitude,l.longitude
       ORDER BY l.name`,
    );
  }

  locationsList() {
    return this.db.query('SELECT * FROM machine_locations WHERE is_active=1 ORDER BY name');
  }

  async createLocation(dto: CreateLocationDto, actorId: string) {
    let latitude = dto.latitude;
    let longitude = dto.longitude;
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException('Latitude and longitude must be provided together');
    }
    if (latitude === undefined && process.env.GOOGLE_MAPS_SERVER_API_KEY) {
      const address = [dto.address, dto.ward, dto.district, dto.city].filter(Boolean).join(', ');
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('key', process.env.GOOGLE_MAPS_SERVER_API_KEY);
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new BadRequestException('Google Geocoding request failed');
      const data = await response.json() as { status: string; results?: Array<{ geometry: { location: { lat: number; lng: number } } }> };
      if (data.status !== 'OK' || !data.results?.[0]) throw new BadRequestException('Address could not be geocoded');
      latitude = data.results[0].geometry.location.lat;
      longitude = data.results[0].geometry.location.lng;
    }
    if (latitude === undefined || longitude === undefined) {
      throw new BadRequestException('Provide map coordinates or configure GOOGLE_MAPS_SERVER_API_KEY');
    }

    return this.db.transaction(async (manager) => {
      const result = await manager.query(
        `INSERT INTO machine_locations(name,address,ward,district,city,latitude,longitude)
         VALUES(?,?,?,?,?,?,?)`,
        [dto.name.trim(), dto.address.trim(), dto.ward ?? null, dto.district ?? null, dto.city ?? null, latitude, longitude],
      );
      await manager.query(
        `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
         VALUES(?,'CREATE_LOCATION','MACHINE_LOCATION',?,?)`,
        [actorId, result.insertId, JSON.stringify({ address: dto.address, latitude, longitude })],
      );
      return { locationId: Number(result.insertId), latitude, longitude };
    });
  }

  async create(dto: CreateMachineDto, actorId: string) {
    return this.db.transaction(async (manager) => {
      const result = await manager.query(
        `INSERT INTO machines(machine_code,serial_number,model,installed_at)
         VALUES(?,?,?,?)`,
        [dto.machineCode.trim().toUpperCase(), dto.serialNumber?.trim() || null, dto.model?.trim() || null, dto.installedAt ?? null],
      );
      await manager.query(
        `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
         VALUES(?,'CREATE_MACHINE','MACHINE',?,?)`,
        [actorId, result.insertId, JSON.stringify({ machineCode: dto.machineCode })],
      );
      return { machineId: Number(result.insertId), machineCode: dto.machineCode.trim().toUpperCase() };
    });
  }

  async update(id: number, dto: UpdateMachineDto, actorId: string) {
    const fields: Array<[string, unknown]> = [
      ['serial_number', dto.serialNumber?.trim() || (dto.serialNumber === '' ? null : undefined)],
      ['model', dto.model?.trim() || (dto.model === '' ? null : undefined)],
      ['firmware_version', dto.firmwareVersion],
      ['operational_status', dto.operationalStatus],
      ['installed_at', dto.installedAt],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;
    if (!fields.length) throw new BadRequestException('No changes supplied');
    return this.db.transaction(async (manager) => {
      const [machine] = await manager.query('SELECT machine_id,operational_status FROM machines WHERE machine_id=? FOR UPDATE', [id]);
      if (!machine) throw new NotFoundException('Machine not found');
      if (machine.operational_status === 'DECOMMISSIONED') throw new ConflictException('A decommissioned machine cannot be edited');
      await manager.query(`UPDATE machines SET ${fields.map(([column]) => `${column}=?`).join(',')} WHERE machine_id=?`, [...fields.map(([, value]) => value), id]);
      await manager.query(
        `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
         VALUES(?,'UPDATE_MACHINE','MACHINE',?,?)`,
        [actorId, id, JSON.stringify(dto)],
      );
      const [updated] = await manager.query('SELECT * FROM machines WHERE machine_id=?', [id]);
      return updated;
    });
  }

  async remove(id: number, actorId: string) {
    return this.db.transaction(async (manager) => {
      const [machine] = await manager.query('SELECT machine_id,operational_status FROM machines WHERE machine_id=? FOR UPDATE', [id]);
      if (!machine) throw new NotFoundException('Machine not found');
      if (machine.operational_status === 'DECOMMISSIONED') return { ok: true, idempotent: true };
      const [activeSession] = await manager.query(
        `SELECT rs.session_id FROM recycling_sessions rs JOIN machine_deployments md ON md.deployment_id=rs.deployment_id
         WHERE md.machine_id=? AND md.removed_at IS NULL AND rs.status IN ('WAITING_LOGIN','DEPOSITING','PROCESSING') LIMIT 1`,
        [id],
      );
      if (activeSession) throw new ConflictException('Machine has an active recycling session');
      await manager.query("UPDATE machines SET operational_status='DECOMMISSIONED' WHERE machine_id=?", [id]);
      await manager.query('UPDATE machine_deployments SET removed_at=NOW() WHERE machine_id=? AND removed_at IS NULL', [id]);
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES(?,'DECOMMISSION_MACHINE','MACHINE',?)", [actorId, id]);
      return { ok: true };
    });
  }

  async bins(machineId: number) {
    const [machine] = await this.db.query('SELECT machine_id FROM machines WHERE machine_id=?', [machineId]);
    if (!machine) throw new NotFoundException('Machine not found');
    return this.db.query(
      `SELECT b.*,mt.code material_code,mt.name material_name,v.fill_percent,v.weight_kg,v.recorded_at
       FROM machine_bins b JOIN materials mt ON mt.material_id=b.material_id
       LEFT JOIN v_bin_latest v ON v.bin_id=b.bin_id WHERE b.machine_id=? ORDER BY mt.name`,
      [machineId],
    );
  }

  async createBin(machineId: number, dto: CreateMachineBinDto, actorId: string) {
    return this.db.transaction(async (manager) => {
      const [machine] = await manager.query('SELECT machine_id FROM machines WHERE machine_id=? FOR UPDATE', [machineId]);
      if (!machine) throw new NotFoundException('Machine not found');
      const [material] = await manager.query('SELECT material_id FROM materials WHERE material_id=?', [dto.materialId]);
      if (!material) throw new BadRequestException('Material not found');
      const result = await manager.query(
        `INSERT INTO machine_bins(machine_id,material_id,processing,capacity_items,capacity_kg)
         VALUES(?,?,?,?,?)`,
        [machineId, dto.materialId, dto.processing, dto.capacityItems ?? null, dto.capacityKg ?? null],
      );
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES(?,'CREATE_MACHINE_BIN','MACHINE_BIN',?)", [actorId, result.insertId]);
      return { binId: Number(result.insertId) };
    });
  }

  async updateBin(machineId: number, binId: number, dto: UpdateMachineBinDto, actorId: string) {
    const fields: Array<[string, unknown]> = [
      ['processing', dto.processing], ['capacity_items', dto.capacityItems], ['capacity_kg', dto.capacityKg], ['status', dto.status],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;
    if (!fields.length) throw new BadRequestException('No changes supplied');
    return this.db.transaction(async (manager) => {
      const [bin] = await manager.query('SELECT bin_id FROM machine_bins WHERE bin_id=? AND machine_id=? FOR UPDATE', [binId, machineId]);
      if (!bin) throw new NotFoundException('Machine bin not found');
      await manager.query(`UPDATE machine_bins SET ${fields.map(([column]) => `${column}=?`).join(',')} WHERE bin_id=?`, [...fields.map(([, value]) => value), binId]);
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail) VALUES(?,'UPDATE_MACHINE_BIN','MACHINE_BIN',?,?)", [actorId, binId, JSON.stringify(dto)]);
      return { ok: true };
    });
  }

  async issueKey(machineId: number, actorId: string) {
    const apiKey = randomBytes(32).toString('base64url');
    return this.db.transaction(async (manager) => {
      const [machine] = await manager.query('SELECT machine_id FROM machines WHERE machine_id=? AND operational_status<>\'DECOMMISSIONED\' FOR UPDATE', [machineId]);
      if (!machine) throw new NotFoundException('Machine not found or decommissioned');
      const result = await manager.query('INSERT INTO machine_api_keys(machine_id,key_hash) VALUES(?,?)', [machineId, await hash(apiKey, 12)]);
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail) VALUES(?,'ISSUE_MACHINE_KEY','MACHINE',?,?)", [actorId, machineId, JSON.stringify({ keyId: result.insertId })]);
      return { keyId: Number(result.insertId), apiKey };
    });
  }

  async keys(machineId: number) {
    const [machine] = await this.db.query('SELECT machine_id FROM machines WHERE machine_id=?', [machineId]);
    if (!machine) throw new NotFoundException('Machine not found');
    return this.db.query(
      'SELECT key_id,created_at,revoked_at FROM machine_api_keys WHERE machine_id=? ORDER BY created_at DESC',
      [machineId],
    );
  }

  async revokeKey(machineId: number, keyId: number, actorId: string) {
    return this.db.transaction(async (manager) => {
      const [key] = await manager.query(
        'SELECT key_id,revoked_at FROM machine_api_keys WHERE key_id=? AND machine_id=? FOR UPDATE',
        [keyId, machineId],
      );
      if (!key) throw new NotFoundException('Machine key not found');
      if (key.revoked_at) return { ok: true, idempotent: true };
      await manager.query('UPDATE machine_api_keys SET revoked_at=NOW() WHERE key_id=?', [keyId]);
      await manager.query(
        "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail) VALUES(?,'REVOKE_MACHINE_KEY','MACHINE',?,?)",
        [actorId, machineId, JSON.stringify({ keyId })],
      );
      return { ok: true, idempotent: false };
    });
  }

  async deploy(machineId: number, locationId: number, actorId: string) {
    return this.db.transaction(async (manager) => {
      const [machine] = await manager.query('SELECT machine_id,operational_status FROM machines WHERE machine_id=? FOR UPDATE', [machineId]);
      if (!machine || machine.operational_status === 'DECOMMISSIONED') throw new NotFoundException('Machine not found or decommissioned');
      const [location] = await manager.query('SELECT location_id FROM machine_locations WHERE location_id=? AND is_active=1 FOR UPDATE', [locationId]);
      if (!location) throw new NotFoundException('Active location not found');
      const [active] = await manager.query('SELECT deployment_id FROM machine_deployments WHERE machine_id=? AND removed_at IS NULL FOR UPDATE', [machineId]);
      if (active) throw new ConflictException('Machine already has an active location');
      const result = await manager.query('INSERT INTO machine_deployments(machine_id,location_id,deployed_at) VALUES(?,?,NOW())', [machineId, locationId]);
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail) VALUES(?,'DEPLOY_MACHINE','MACHINE',?,?)", [actorId, machineId, JSON.stringify({ locationId, deploymentId: result.insertId })]);
      return { deploymentId: Number(result.insertId) };
    });
  }

  async heartbeat(machineId: number, dto: HeartbeatDto) {
    const result = await this.db.query(
      `UPDATE machines SET last_heartbeat_at=NOW(),firmware_version=COALESCE(?,firmware_version)
       WHERE machine_id=? AND operational_status<>'DECOMMISSIONED'`,
      [dto.firmwareVersion ?? null, machineId],
    );
    if (!result.affectedRows) throw new NotFoundException('Machine not found or decommissioned');
    return { ok: true, serverTime: new Date() };
  }

  async telemetry(machineId: number, dto: TelemetryDto) {
    return this.db.transaction(async (manager) => {
      const [bin] = await manager.query(
        `SELECT bin_id FROM machine_bins WHERE bin_id=? AND machine_id=? AND status='ACTIVE' FOR UPDATE`,
        [dto.binId, machineId],
      );
      if (!bin) throw new BadRequestException('Active bin does not belong to this machine');
      await manager.query('INSERT INTO bin_readings(bin_id,fill_percent,weight_kg) VALUES(?,?,?)', [dto.binId, dto.fillPercent, dto.weightKg ?? null]);
      if (dto.fillPercent >= Number(process.env.BIN_ALERT_THRESHOLD ?? 90)) {
        const [alertType] = await manager.query("SELECT alert_type_id FROM alert_types WHERE code='BIN_FULL'");
        if (alertType) {
          const [open] = await manager.query(
            'SELECT alert_id FROM machine_alerts WHERE machine_id=? AND alert_type_id=? AND resolved_at IS NULL LIMIT 1 FOR UPDATE',
            [machineId, alertType.alert_type_id],
          );
          if (!open) {
            await manager.query('INSERT INTO machine_alerts(machine_id,alert_type_id,message) VALUES(?,?,?)', [machineId, alertType.alert_type_id, `Bin ${dto.binId} is ${dto.fillPercent}% full`]);
          }
        }
      }
      return { accepted: true };
    });
  }

}
