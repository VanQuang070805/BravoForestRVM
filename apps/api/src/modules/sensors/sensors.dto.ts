import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
export class MachineAlertDto{@IsInt()alertTypeId!:number;@IsOptional()@IsString()@MaxLength(255)message?:string;}
