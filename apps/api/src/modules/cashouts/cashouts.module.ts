import { Module } from '@nestjs/common';
import { AdminCashoutsController, CashoutsController } from './cashouts.controller';
import { CashoutsService } from './cashouts.service';

@Module({ controllers: [CashoutsController, AdminCashoutsController], providers: [CashoutsService] })
export class CashoutsModule {}
