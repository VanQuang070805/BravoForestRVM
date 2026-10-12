import { Controller, Get, Param, ParseIntPipe, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('customer')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}
  private page(value: string | undefined, fallback: number, max: number) { return Math.min(max, Math.max(0, Number(value ?? fallback) || fallback)); }

  @Get('users/me') me(@Req() req: any) { return this.service.dashboard(req.user.sub); }
  @Get('wallet') wallet(@Req() req: any) { return this.service.wallet(req.user.sub); }
  @Get('wallet/ledger') ledger(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.service.ledger(req.user.sub, this.page(limit, 50, 100), this.page(offset, 0, 100000)); }
  @Get('returns') returns(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string) { return this.service.returns(req.user.sub, this.page(limit, 50, 100), this.page(offset, 0, 100000)); }
  @Get('notifications') notifications(@Req() req: any) { return this.service.notifications(req.user.sub); }
  @Patch('notifications/:id/read') read(@Req() req: any, @Param('id', ParseIntPipe) id: number) { return this.service.markNotificationRead(req.user.sub, String(id)); }
}
