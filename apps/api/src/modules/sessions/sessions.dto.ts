import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Matches, Min, ValidateIf } from 'class-validator';
export class ClaimDto { @IsString() @Length(64,64) @Matches(/^[a-f0-9]{64}$/i) qrToken!:string; }
export class CreateSessionDto { @IsOptional() @IsIn(['MEMBER','GUEST']) mode?:'MEMBER'|'GUEST'; }
export class ScanDto { @IsOptional() @IsString() barcode?:string; @IsOptional() @IsNumber() @Min(0) measuredWeightG?:number; @ValidateIf(x=>x.rejectReasonId==null) @IsInt() ruleId?:number; @ValidateIf(x=>x.ruleId==null) @IsInt() rejectReasonId?:number; @IsOptional() @IsObject() sensorData?:Record<string,unknown>; }
