import { IsDateString, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

export class HeartbeatDto {
  @IsOptional() @IsString() @MaxLength(30) firmwareVersion?: string;
  @IsOptional() @IsInt() @Min(0) uptimeSeconds?: number;
}

export class TelemetryDto {
  @IsInt() @Min(1) binId!: number;
  @IsInt() @Min(0) @Max(100) fillPercent!: number;
  @IsOptional() @IsNumber() @Min(0) weightKg?: number;
}

export class CreateLocationDto {
  @IsString() @Length(2, 150) name!: string;
  @IsString() @Length(3, 255) address!: string;
  @IsOptional() @IsString() @MaxLength(100) ward?: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
}

export class CreateMachineDto {
  @IsString() @Length(2, 30) machineCode!: string;
  @IsOptional() @IsString() @MaxLength(60) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsDateString() installedAt?: string;
}

export class UpdateMachineDto {
  @IsOptional() @IsString() @MaxLength(60) serialNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @IsString() @MaxLength(30) firmwareVersion?: string;
  @IsOptional() @IsEnum(['ACTIVE', 'MAINTENANCE', 'DISABLED']) operationalStatus?: string;
  @IsOptional() @IsDateString() installedAt?: string;
}

export class CreateMachineBinDto {
  @IsInt() @Min(1) materialId!: number;
  @IsEnum(['CRUSH', 'STORE']) processing!: string;
  @IsOptional() @IsInt() @Min(1) capacityItems?: number;
  @IsOptional() @IsNumber() @Min(0) capacityKg?: number;
}

export class UpdateMachineBinDto {
  @IsOptional() @IsEnum(['CRUSH', 'STORE']) processing?: string;
  @IsOptional() @IsInt() @Min(1) capacityItems?: number | null;
  @IsOptional() @IsNumber() @Min(0) capacityKg?: number | null;
  @IsOptional() @IsEnum(['ACTIVE', 'DISABLED']) status?: string;
}

export class ScanItemDto {
  @IsOptional() @IsString() @MaxLength(50) barcode?: string;
  @IsOptional() @IsNumber() @Min(0) measuredWeightG?: number;
  @IsOptional() @IsInt() @Min(1) ruleId?: number;
  @IsOptional() @IsInt() @Min(1) rejectReasonId?: number;
  @IsOptional() @IsObject() sensorData?: Record<string, unknown>;
}
