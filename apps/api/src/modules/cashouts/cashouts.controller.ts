import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/security';
import { CashoutsService } from './cashouts.service';
import { CashoutPaidDto, CashoutReasonDto, SubmitCashoutDto, UpdateCashoutPolicyDto } from './cashouts.dto';

@ApiTags('cashouts')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller()
export class CashoutsController {
  constructor(private readonly service: CashoutsService) {}

  @Get('cashouts/policy') policy() { return this.service.customerPolicy(); }
  @Get('cashouts') list(@Req() req: any, @Query('page') page = '1', @Query('pageSize') pageSize = '10') {
    return this.service.customerList(req.user.sub, page, pageSize);
  }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('cashouts') create(@Req() req: any, @Body() dto: SubmitCashoutDto) {
    return this.service.submit(req.user.sub, dto);
  }
}

@ApiTags('admin-cashouts')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/cashouts')
export class AdminCashoutsController {
  constructor(private readonly service: CashoutsService) {}

  @Get('policy') policy() { return this.service.adminPolicy(); }
  @Patch('policy') updatePolicy(@Body() dto: UpdateCashoutPolicyDto, @Req() req: any) {
    return this.service.updatePolicy(dto, req.user.sub, req.ip);
  }
  @Get() list(
    @Query('search') search = '',
    @Query('status') status = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) { return this.service.adminList(search, status, page, pageSize); }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.adminDetail(String(id), req.user.sub, req.ip);
  }
  @Post(':id/approve') approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.approve(String(id), req.user.sub, req.ip);
  }
  @Post(':id/reject') reject(@Param('id', ParseIntPipe) id: number, @Body() dto: CashoutReasonDto, @Req() req: any) {
    return this.service.reject(String(id), dto.reason, req.user.sub, req.ip);
  }
  @Post(':id/paid') paid(@Param('id', ParseIntPipe) id: number, @Body() dto: CashoutPaidDto, @Req() req: any) {
    return this.service.markPaid(String(id), dto.transferReference, req.user.sub, req.ip);
  }
  @Post(':id/failed') failed(@Param('id', ParseIntPipe) id: number, @Body() dto: CashoutReasonDto, @Req() req: any) {
    return this.service.fail(String(id), dto.reason, req.user.sub, req.ip);
  }
}
