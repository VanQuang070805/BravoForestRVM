import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../../common/security';
import { MachineAuthGuard } from './machine-auth.guard';
import {
  CreateLocationDto,
  CreateMachineBinDto,
  CreateMachineDto,
  HeartbeatDto,
  TelemetryDto,
  UpdateMachineBinDto,
  UpdateMachineDto,
} from './machines.dto';
import { MachinesService } from './machines.service';

@ApiTags('machines')
@Controller()
export class MachinesController {
  constructor(private readonly service: MachinesService) {}

  @Public() @Get('locations') locations() { return this.service.locationsList(); }
  @Public() @Get('map') map() { return this.service.map(); }

  @ApiBearerAuth() @Roles('ADMIN', 'TECHNICIAN') @Get('admin/machines') list() { return this.service.list(); }
  @ApiBearerAuth() @Roles('ADMIN') @Post('admin/machines') create(@Body() dto: CreateMachineDto, @Req() req: any) { return this.service.create(dto, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Patch('admin/machines/:id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMachineDto, @Req() req: any) { return this.service.update(id, dto, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Delete('admin/machines/:id') remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) { return this.service.remove(id, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Get('admin/machines/:id/bins') bins(@Param('id', ParseIntPipe) id: number) { return this.service.bins(id); }
  @ApiBearerAuth() @Roles('ADMIN') @Post('admin/machines/:id/bins') createBin(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateMachineBinDto, @Req() req: any) { return this.service.createBin(id, dto, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Patch('admin/machines/:id/bins/:binId') updateBin(@Param('id', ParseIntPipe) id: number, @Param('binId', ParseIntPipe) binId: number, @Body() dto: UpdateMachineBinDto, @Req() req: any) { return this.service.updateBin(id, binId, dto, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Post('admin/machines/:id/keys') key(@Param('id', ParseIntPipe) id: number, @Req() req: any) { return this.service.issueKey(id, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Get('admin/machines/:id/keys') keys(@Param('id', ParseIntPipe) id: number) { return this.service.keys(id); }
  @ApiBearerAuth() @Roles('ADMIN') @Delete('admin/machines/:id/keys/:keyId') revokeKey(@Param('id', ParseIntPipe) id: number, @Param('keyId', ParseIntPipe) keyId: number, @Req() req: any) { return this.service.revokeKey(id, keyId, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Post('admin/machines/:id/deploy/:locationId') deploy(@Param('id', ParseIntPipe) id: number, @Param('locationId', ParseIntPipe) locationId: number, @Req() req: any) { return this.service.deploy(id, locationId, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Post('admin/locations') createLocation(@Body() dto: CreateLocationDto, @Req() req: any) { return this.service.createLocation(dto, req.user.sub); }

  @Public() @UseGuards(MachineAuthGuard) @ApiHeader({ name: 'x-machine-id' }) @ApiHeader({ name: 'x-api-key' })
  @ApiHeader({ name: 'x-request-nonce' }) @ApiHeader({ name: 'x-request-timestamp' })
  @Post('machine/heartbeat') heartbeat(@Req() req: any, @Body() dto: HeartbeatDto) { return this.service.heartbeat(req.machineId, dto); }
  @Public() @UseGuards(MachineAuthGuard) @Post('machine/telemetry') telemetry(@Req() req: any, @Body() dto: TelemetryDto) { return this.service.telemetry(req.machineId, dto); }
}
