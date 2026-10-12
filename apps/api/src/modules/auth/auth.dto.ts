import { IsEmail, IsOptional, IsPhoneNumber, IsString, Length, ValidateIf } from 'class-validator';
export class RegisterDto { @IsString() @Length(2,100) fullName!:string; @ValidateIf(x=>!x.phone) @IsEmail() @Length(3,150) email?:string; @ValidateIf(x=>!x.email) @IsPhoneNumber('VN') phone?:string; @IsString() @Length(10,72) password!:string; }
export class LoginDto { @IsString() @Length(3,150) identifier!:string; @IsString() @Length(1,72) password!:string; }
export class RefreshDto { @IsOptional() @IsString() refreshToken?:string; }
export class UpdateProfileDto { @IsOptional() @IsString() @Length(2,100) fullName?:string; @IsOptional() @IsPhoneNumber('VN') phone?:string; }
