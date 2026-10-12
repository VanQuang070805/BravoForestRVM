import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/security';
import { AdjustPointsDto, ClosePointRuleDto, WalletStatusDto } from './points.dto';
import { PointsService } from './points.service';

@ApiTags('points')
@Controller()
export class PointsController {
  constructor(private readonly service: PointsService) {}

  @ApiBearerAuth() @Get('container-types') catalog() { return this.service.catalog(); }
  @ApiBearerAuth() @Roles('ADMIN') @Get('admin/point-rules') rules() { return this.service.rules(); }
  @ApiBearerAuth() @Roles('ADMIN') @Patch('admin/point-rules/:id/close') closeRule(@Param('id', ParseIntPipe) id: number, @Body() dto: ClosePointRuleDto, @Req() req: any) { return this.service.closeRule(id, dto.validTo, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Post('admin/users/:id/wallet/adjust') adjust(@Param('id') id: string, @Body() dto: AdjustPointsDto, @Req() req: any) { return this.service.adjust(id, dto.points, dto.note, req.user.sub); }
  @ApiBearerAuth() @Roles('ADMIN') @Patch('admin/users/:id/wallet/status') walletStatus(@Param('id') id: string, @Body() dto: WalletStatusDto, @Req() req: any) { return this.service.walletStatus(id, dto.status as 'ACTIVE' | 'FROZEN', req.user.sub); }
}
