import { IsInt, IsString, Length, Min } from 'class-validator';

export class CreatePartnerLinkDto {
  @IsInt() @Min(1) partnerId!: number;
  @IsString() @Length(1, 100) externalAccountId!: string;
}
