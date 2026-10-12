
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JwtAuthGuard, RolesGuard } from './common/security';
import { RedisModule } from './common/redis.module';
import { REDIS } from './common/redis.module';
import { RedisThrottlerStorage } from './common/redis-throttler.storage';
import { validate } from './config/validation';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { CrushingModule } from './modules/crushing/crushing.module';
import { HealthModule } from './modules/health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { MachinesModule } from './modules/machines/machines.module';
import { PointsModule } from './modules/points/points.module';
import { PartnerLinksModule } from './modules/partner-links/partner-links.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { UsersModule } from './modules/users/users.module';

@Module({imports:[
 ConfigModule.forRoot({isGlobal:true,validate}),
 TypeOrmModule.forRootAsync({inject:[ConfigService],useFactory:(c:ConfigService)=>({type:'mariadb',host:c.getOrThrow('DB_HOST'),port:c.get<number>('DB_PORT',3306),username:c.getOrThrow('DB_USER'),password:c.get('DB_PASSWORD',''),database:c.getOrThrow('DB_NAME'),entities:[__dirname+'/**/*.entity{.ts,.js}'],autoLoadEntities:true,synchronize:false,logging:false})}),
 RedisModule,ThrottlerModule.forRootAsync({imports:[RedisModule],inject:[REDIS],useFactory:(redis:Redis)=>({throttlers:[{name:'default',ttl:60000,limit:120}],storage:new RedisThrottlerStorage(redis)})}),BullModule.forRootAsync({inject:[ConfigService],useFactory:(c:ConfigService)=>({connection:{url:c.getOrThrow('REDIS_URL')}})}),
 AuthModule,UsersModule,MachinesModule,LocationsModule,SessionsModule,CrushingModule,SensorsModule,
 PointsModule,CollectionsModule,PartnerLinksModule,RewardsModule,AdminModule,HealthModule
],providers:[{provide:APP_GUARD,useClass:ThrottlerGuard},{provide:APP_GUARD,useClass:JwtAuthGuard},{provide:APP_GUARD,useClass:RolesGuard}]}) export class AppModule{}
