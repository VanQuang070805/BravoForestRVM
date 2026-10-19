import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/security';
import { UpdateLocationDto } from './locations.dto';
import { LocationsService } from './locations.service';

@ApiTags('admin-locations')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @Get()
  list(
    @Query('search') search = '',
    @Query('city') city = '',
    @Query('active') isActive = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.service.list(search, city, isActive, page, pageSize);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLocationDto, @Req() request: any) {
    return this.service.update(id, dto, request.user.sub);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: any) {
    return this.service.deactivate(id, request.user.sub);
  }

  @Post('machines/:machineId/undeploy')
  undeploy(@Param('machineId', ParseIntPipe) id: number, @Req() request: any) {
    return this.service.undeploy(id, request.user.sub);
  }
}
