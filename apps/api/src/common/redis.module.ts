import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
export const REDIS=Symbol('REDIS');
@Global() @Module({providers:[{provide:REDIS,useFactory:()=>new Redis(process.env.REDIS_URL??'redis://127.0.0.1:6379',{maxRetriesPerRequest:null})}],exports:[REDIS]}) export class RedisModule{}
