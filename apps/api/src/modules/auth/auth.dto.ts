import { IsEmail, IsOptional, IsPhoneNumber, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString() @Length(2, 100) fullName!: string;
  @IsEmail() @Length(3, 150) email!: string;
  @IsOptional() @IsPhoneNumber('VN') @Matches(/^0\d{9}$/) phone?: string;
  @IsString() @Length(10, 72) password!: string;
}

export class RegisterVerifyDto {
  @IsEmail() @Length(3, 150) email!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class EmailOtpDto {
  @IsEmail() @Length(3, 150) email!: string;
}

export class PasswordResetVerifyDto extends EmailOtpDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class PasswordResetDto extends EmailOtpDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsString() @Length(10, 72) newPassword!: string;
}

export class ChangePasswordDto {
  @IsString() @Length(1, 72) currentPassword!: string;
  @IsString() @Length(10, 72) newPassword!: string;
}

export class LoginDto {
  @IsString() @Length(1, 150) @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[A-Za-z0-9_.-]{1,60})$/, { message: 'Vui lòng nhập email hoặc tên đăng nhập hợp lệ.' }) identifier!: string;
  @IsString() @Length(1, 72) password!: string;
}

export class RefreshDto { @IsOptional() @IsString() refreshToken?: string; }

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(2, 100) fullName?: string;
  @IsOptional() @IsPhoneNumber('VN') @Matches(/^0\d{9}$/) phone?: string;
}
