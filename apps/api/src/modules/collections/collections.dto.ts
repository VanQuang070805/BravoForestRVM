import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export class RecordCollectionDto { @IsOptional() @IsNumber() @Min(0) weightKg?: number; @IsOptional() @IsString() @MaxLength(255) note?: string; }
