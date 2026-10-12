import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
export class ClaimDto { @IsString() qrToken!:string; }
export class CreateSessionDto { @IsOptional() @IsIn(['MEMBER','GUEST']) mode?:'MEMBER'|'GUEST'; }
export class ScanDto { @IsOptional() @IsString() barcode?:string; @IsOptional() @IsNumber() @Min(0) measuredWeightG?:number; @ValidateIf(x=>x.rejectReasonId==null) @IsInt() ruleId?:number; @ValidateIf(x=>x.ruleId==null) @IsInt() rejectReasonId?:number; @IsOptional() @IsObject() sensorData?:Record<string,unknown>; }
