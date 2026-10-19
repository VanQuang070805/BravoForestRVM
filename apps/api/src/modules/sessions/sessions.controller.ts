import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/security';
import { MachineAuthGuard } from '../machines/machine-auth.guard';
import { ClaimDto, CreateSessionDto, ScanDto } from './sessions.dto';
import { SessionsService } from './sessions.service';

@ApiTags('recycling-sessions')
@Controller()
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @ApiBearerAuth()
  @Post('sessions/claim')
  claim(@Req() request: any, @Body() dto: ClaimDto) {
    return this.service.claim(request.user.sub, dto.qrToken);
  }

  @ApiBearerAuth()
  @Get('sessions')
  history(@Req() request: any) {
    return this.service.history(request.user.sub);
  }

  @ApiBearerAuth()
  @Get('sessions/:id')
  detail(@Req() request: any, @Param('id') id: string) {
    return this.service.detail(request.user.sub, id);
  }

  @Public()
  @UseGuards(MachineAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('machine/sessions')
  create(@Req() request: any, @Body() dto: CreateSessionDto) {
    return this.service.create(request.machineId, dto.mode);
  }

  @Public()
  @UseGuards(MachineAuthGuard)
  @Get('machine/sessions/:id/status')
  status(@Req() request: any, @Param('id') id: string, @Headers('x-session-token') token?: string) {
    return this.service.machineStatus(request.machineId, id, token ?? '');
  }

  @Public()
  @UseGuards(MachineAuthGuard)
  @Post('machine/sessions/:id/items')
  scan(
    @Req() request: any,
    @Param('id') id: string,
    @Body() dto: ScanDto,
    @Headers('x-idempotency-key') key: string,
  ) {
    return this.service.scan(request.machineId, id, dto, key);
  }

  @Public()
  @UseGuards(MachineAuthGuard)
  @Post('machine/sessions/:id/confirm')
  confirm(@Req() request: any, @Param('id') id: string) {
    return this.service.confirm(request.machineId, id);
  }

  @Public()
  @UseGuards(MachineAuthGuard)
  @Post('machine/sessions/:id/finalize')
  finalize(@Req() request: any, @Param('id') id: string) {
    return this.service.finalize(request.machineId, id);
  }

  @Public()
  @UseGuards(MachineAuthGuard)
  @Post('machine/sessions/:id/cancel')
  cancel(@Req() request: any, @Param('id') id: string, @Headers('x-session-token') token?: string) {
    return this.service.cancel(request.machineId, id, token ?? '');
  }

  @Public()
  @UseGuards(MachineAuthGuard)
  @Get('machine/scan-options')
  scanOptions(@Req() request: any) {
    return this.service.scanOptions(request.machineId);
  }
}
