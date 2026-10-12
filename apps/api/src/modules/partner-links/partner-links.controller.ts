import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/security';
import { CreatePartnerLinkDto } from './partner-links.dto';
import { PartnerLinksService } from './partner-links.service';

@ApiTags('partners')
@Controller()
export class PartnerLinksController {
  constructor(private readonly service: PartnerLinksService) {}

  @Public() @Get('partners') partners() { return this.service.partners(); }
  @ApiBearerAuth() @Get('partner-links') links(@Req() req: any) { return this.service.list(req.user.sub); }
  @ApiBearerAuth() @Post('partner-links') create(@Req() req: any, @Body() dto: CreatePartnerLinkDto) { return this.service.create(req.user.sub, dto); }
  @ApiBearerAuth() @Delete('partner-links/:id') revoke(@Req() req: any, @Param('id') id: string) { return this.service.revoke(req.user.sub, id); }
}
