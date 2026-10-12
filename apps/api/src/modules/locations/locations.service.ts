import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UpdateLocationDto } from './locations.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly db: DataSource) {}

  list() {
    return this.db.query(
      `SELECT l.*,COUNT(md.deployment_id) active_machines
       FROM machine_locations l
       LEFT JOIN machine_deployments md ON md.location_id=l.location_id AND md.removed_at IS NULL
       GROUP BY l.location_id ORDER BY l.name`,
    );
  }

  async update(id: number, dto: UpdateLocationDto, userId: string) {
    const current = await this.get(id);
    const addressChanged = ['address', 'ward', 'district', 'city'].some((key) => dto[key as keyof UpdateLocationDto] !== undefined);
    const hasLatitude = dto.latitude !== undefined;
    const hasLongitude = dto.longitude !== undefined;
    if (hasLatitude !== hasLongitude) throw new BadRequestException('Latitude and longitude must be provided together');

    let coordinates: { latitude: number; longitude: number } | undefined;
    if (hasLatitude && hasLongitude) {
      coordinates = { latitude: dto.latitude!, longitude: dto.longitude! };
    } else if (addressChanged) {
      const address = {
        address: dto.address ?? current.address,
        ward: dto.ward ?? current.ward,
        district: dto.district ?? current.district,
        city: dto.city ?? current.city,
      };
      coordinates = await this.geocode(address);
    }

    const fields: Array<[string, unknown]> = [
      ['name', dto.name?.trim()], ['address', dto.address?.trim()], ['ward', dto.ward],
      ['district', dto.district], ['city', dto.city], ['is_active', dto.isActive],
      ['latitude', coordinates?.latitude], ['longitude', coordinates?.longitude],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;
    if (!fields.length) return current;

    return this.db.transaction(async (manager) => {
      const [location] = await manager.query('SELECT location_id FROM machine_locations WHERE location_id=? FOR UPDATE', [id]);
      if (!location) throw new NotFoundException('Location not found');
      if (dto.isActive === false) {
        const [deployment] = await manager.query(
          'SELECT deployment_id FROM machine_deployments WHERE location_id=? AND removed_at IS NULL LIMIT 1 FOR UPDATE',
          [id],
        );
        if (deployment) throw new ConflictException('Undeploy the active machines before deactivating this location');
      }

      await manager.query(
        `UPDATE machine_locations SET ${fields.map(([column]) => `${column}=?`).join(',')} WHERE location_id=?`,
        [...fields.map(([, value]) => value), id],
      );
      await manager.query(
        "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail) VALUES(?,'UPDATE_LOCATION','MACHINE_LOCATION',?,?)",
        [userId, id, JSON.stringify({ ...dto, ...(coordinates ?? {}) })],
      );
      const [updated] = await manager.query('SELECT * FROM machine_locations WHERE location_id=?', [id]);
      return updated;
    });
  }

  async get(id: number) {
    const [row] = await this.db.query('SELECT * FROM machine_locations WHERE location_id=?', [id]);
    if (!row) throw new NotFoundException('Location not found');
    return row;
  }

  async deactivate(id: number, userId: string) {
    return this.db.transaction(async (manager) => {
      const [row] = await manager.query('SELECT location_id,is_active FROM machine_locations WHERE location_id=? FOR UPDATE', [id]);
      if (!row) throw new NotFoundException('Location not found');
      if (!row.is_active) return { ok: true, idempotent: true };
      const [active] = await manager.query(
        'SELECT deployment_id FROM machine_deployments WHERE location_id=? AND removed_at IS NULL LIMIT 1 FOR UPDATE',
        [id],
      );
      if (active) throw new ConflictException('Undeploy the active machines before deactivating this location');
      await manager.query('UPDATE machine_locations SET is_active=0 WHERE location_id=?', [id]);
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES(?,'DEACTIVATE_LOCATION','MACHINE_LOCATION',?)", [userId, id]);
      return { ok: true, idempotent: false };
    });
  }

  async undeploy(machineId: number, userId: string) {
    return this.db.transaction(async (manager) => {
      const [deployment] = await manager.query(
        'SELECT deployment_id FROM machine_deployments WHERE machine_id=? AND removed_at IS NULL FOR UPDATE',
        [machineId],
      );
      if (!deployment) throw new NotFoundException('No active deployment');
      await manager.query('UPDATE machine_deployments SET removed_at=NOW() WHERE deployment_id=?', [deployment.deployment_id]);
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES(?,'UNDEPLOY_MACHINE','MACHINE',?)", [userId, machineId]);
      return { ok: true };
    });
  }

  private async geocode(address: { address: string; ward?: string; district?: string; city?: string }) {
    const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
    if (!apiKey) throw new BadRequestException('Address changes require coordinates or GOOGLE_MAPS_SERVER_API_KEY');
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', [address.address, address.ward, address.district, address.city].filter(Boolean).join(', '));
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new BadRequestException('Google Geocoding request failed');
    const data = await response.json() as { status: string; results?: Array<{ geometry: { location: { lat: number; lng: number } } }> };
    if (data.status !== 'OK' || !data.results?.[0]) throw new BadRequestException('Address could not be geocoded');
    return { latitude: data.results[0].geometry.location.lat, longitude: data.results[0].geometry.location.lng };
  }
}
