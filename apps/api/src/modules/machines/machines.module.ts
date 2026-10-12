import { Module } from '@nestjs/common';
import { MachineAuthGuard } from './machine-auth.guard';
import { MachinesController } from './machines.controller';
import { MachinesService } from './machines.service';

@Module({ controllers: [MachinesController], providers: [MachinesService, MachineAuthGuard], exports: [MachineAuthGuard] })
export class MachinesModule {}
