import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/security';
import { RedeemDto } from './rewards.dto';
import { RewardsService } from './rewards.service';

@ApiTags('rewards')
@Controller()
export class RewardsController {
  constructor(private readonly service: RewardsService) {}

  @Public()
  @Get('vouchers')
  catalog(
    @Query('search') search = '',
    @Query('category') category = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '12',
  ) {
    return this.service.catalog(search, category, page, pageSize);
  }

  @ApiBearerAuth()
  @Post('redemptions')
  redeem(@Req() request: any, @Body() dto: RedeemDto) {
    return this.service.redeem(request.user.sub, dto);
  }

  @ApiBearerAuth()
  @Get('redemptions')
  history(@Req() request: any) {
    return this.service.history(request.user.sub);
  }

  @ApiBearerAuth()
  @Get('wallet/transactions')
  wallet(@Req() request: any) {
    return this.service.wallet(request.user.sub);
  }
}
