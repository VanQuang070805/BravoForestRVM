import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class SubmitCashoutDto {
  @IsInt() @Min(1) @Max(2_000_000_000) points!: number;
  @IsInt() @Min(1) policyVersion!: number;
  @IsString() @Length(8, 64) idempotencyKey!: string;
  @IsString() @Length(2, 100) bankName!: string;
  @IsString() @Length(2, 120) accountHolderName!: string;
  @IsString() @Matches(/^\d{6,34}$/) accountNumber!: string;
  @IsString() @Length(8, 72) currentPassword!: string;
}

export class UpdateCashoutPolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000_000) pointsPerStep?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000_000) vndPerStep?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(2_000_000_000) minPoints?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(2_000_000_000) maxPointsPerRequest?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(2_000_000_000) maxPointsPerDay?: number | null;
}

export class CashoutReasonDto {
  @IsString() @Length(4, 255) reason!: string;
}

export class CashoutPaidDto {
  @IsString() @Length(3, 120) transferReference!: string;
}
