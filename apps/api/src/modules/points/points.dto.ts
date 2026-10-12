import { IsDateString, IsEnum, IsInt, IsString, MaxLength } from 'class-validator';

export class AdjustPointsDto {
  @IsInt() points!: number;
  @IsString() @MaxLength(255) note!: string;
}

export class WalletStatusDto {
  @IsEnum(['ACTIVE', 'FROZEN']) status!: string;
}

export class ClosePointRuleDto {
  @IsDateString() validTo!: string;
}
