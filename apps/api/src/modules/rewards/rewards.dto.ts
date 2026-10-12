import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
export class RedeemDto { @IsInt() @Min(1) voucherId!:number; @IsString() @Length(8,64) idempotencyKey!:string; @IsOptional() @IsInt() linkId?:number; }
