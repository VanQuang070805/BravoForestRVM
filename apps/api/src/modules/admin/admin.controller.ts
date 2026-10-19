import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/security';
import {
  AlertTypeDto,
  CategoryDto,
  ContainerTypeDto,
  CreateAdminUserDto,
  MaintenanceDto,
  MaterialDto,
  PartnerDto,
  PointRuleDto,
  RejectReasonDto,
  SettingDto,
  UpdateAdminUserDto,
  UpdatePartnerDto,
  UpdateVoucherDto,
  UserStatusDto,
  VoucherCodesDto,
  VoucherDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('users') users(@Query('search') search = '', @Query('status') status = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') { return this.service.users(search, status, page, pageSize); }
  @Post('users') createUser(@Body() dto: CreateAdminUserDto, @Req() req: any) { return this.service.createUser(dto, req.user.sub); }
  @Patch('users/:id') updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto, @Req() req: any) { return this.service.updateUser(id, dto, req.user.sub); }
  @Patch('users/:id/status') setUserStatus(@Param('id') id: string, @Body() dto: UserStatusDto, @Req() req: any) { return this.service.setUser(id, dto.status, req.user.sub, req.ip); }

  @Get('dashboard/overview') overview() { return this.service.overview(); }

  @Get('sessions') sessions(@Query('status') status = '', @Query('search') search = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') { return this.service.sessions(status, search, page, pageSize); }
  @Get('redemptions') redemptions(@Query('status') status = '', @Query('search') search = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') { return this.service.redemptions(status, search, page, pageSize); }
  @Post('redemptions/:id/used') markRedemptionUsed(@Param('id') id: string, @Req() req: any) { return this.service.markRedemptionUsed(id, req.user.sub); }

  @Get('alerts') alerts(@Query('search') search = '', @Query('status') status = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') { return this.service.alerts(search, status, page, pageSize); }
  @Post('alerts/:id/resolve') resolveAlert(@Param('id') id: string, @Req() req: any) { return this.service.resolveAlert(id, req.user.sub); }
  @Get('maintenance') maintenance(@Query('machineId') id?: string, @Query('search') search = '', @Query('type') type = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') { return this.service.maintenanceList(id ? Number(id) : undefined, search, type, page, pageSize); }
  @Post('maintenance') createMaintenance(@Body() dto: MaintenanceDto, @Req() req: any) { return this.service.maintenance(dto, req.user.sub); }

  @Get('settings') settings() { return this.service.settings(); }
  @Patch('settings/:key') updateSetting(@Param('key') key: string, @Body() dto: SettingDto, @Req() req: any) { return this.service.setting(key, dto.value, dto.description, req.user.sub); }
  @Get('audit-logs') auditLogs() { return this.service.auditLogs(); }

  @Get('partners') partners(@Query('search') search = '', @Query('status') status = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') { return this.service.partners(search, status, page, pageSize); }
  @Post('partners') createPartner(@Body() dto: PartnerDto, @Req() req: any) { return this.service.createPartner(dto, req.user.sub); }
  @Patch('partners/:id') updatePartner(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePartnerDto, @Req() req: any) { return this.service.updatePartner(id, dto, req.user.sub); }

  @Get('vouchers') vouchers(@Query('search') search = '', @Query('status') status = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') { return this.service.vouchers(search, status, page, pageSize); }
  @Post('vouchers') createVoucher(@Body() dto: VoucherDto, @Req() req: any) { return this.service.createVoucher(dto, req.user.sub); }
  @Patch('vouchers/:id') updateVoucher(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVoucherDto, @Req() req: any) { return this.service.updateVoucher(id, dto, req.user.sub); }
  @Post('vouchers/:id/codes') addVoucherCodes(@Param('id', ParseIntPipe) id: number, @Body() dto: VoucherCodesDto, @Req() req: any) { return this.service.addCodes(id, dto.codes, req.user.sub); }

  @Post('point-rules') createPointRule(@Body() dto: PointRuleDto, @Req() req: any) { return this.service.pointRule(dto, req.user.sub); }
  @Get('voucher-categories') categories() { return this.service.categories(); }
  @Post('voucher-categories') createCategory(@Body() dto: CategoryDto, @Req() req: any) { return this.service.createCategory(dto.name, req.user.sub); }
  @Get('materials') materials() { return this.service.materials(); }
  @Post('materials') createMaterial(@Body() dto: MaterialDto, @Req() req: any) { return this.service.createMaterial(dto, req.user.sub); }
  @Get('container-types') containerTypes() { return this.service.containerTypes(); }
  @Post('container-types') createContainerType(@Body() dto: ContainerTypeDto, @Req() req: any) { return this.service.createContainerType(dto, req.user.sub); }
  @Get('reject-reasons') rejectReasons() { return this.service.rejectReasons(); }
  @Post('reject-reasons') createRejectReason(@Body() dto: RejectReasonDto, @Req() req: any) { return this.service.createRejectReason(dto, req.user.sub); }
  @Get('alert-types') alertTypes() { return this.service.alertTypes(); }
  @Post('alert-types') createAlertType(@Body() dto: AlertTypeDto, @Req() req: any) { return this.service.createAlertType(dto, req.user.sub); }
}
