import { Module } from '@nestjs/common';
import { PartnerLinksController } from './partner-links.controller';
import { PartnerLinksService } from './partner-links.service';

@Module({ controllers: [PartnerLinksController], providers: [PartnerLinksService] })
export class PartnerLinksModule {}
