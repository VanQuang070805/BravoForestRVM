import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

class Environment {
  @IsOptional() @IsIn(['development', 'test', 'production']) NODE_ENV = 'development';
  @IsOptional() @IsIn(['true', 'false']) DEV_OTP_LOGGING = 'false';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) PORT = 4000;
  @IsString() DB_HOST!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535) DB_PORT = 3306;
  @IsString() DB_USER!: string;
  @IsOptional() @IsString() DB_PASSWORD = '';
  @IsString() DB_NAME!: string;
  @IsString() REDIS_URL!: string;
  @IsString() JWT_ACCESS_SECRET!: string;
  @IsString() JWT_REFRESH_SECRET!: string;
  @IsOptional() @IsString() JWT_ACCESS_TTL = '15m';
  @IsOptional() @Type(() => Number) @IsInt() @Min(60) @Max(31_536_000) JWT_REFRESH_TTL_SECONDS = 2_592_000;
  @IsString() ENCRYPTION_KEY_BASE64!: string;
  @IsOptional() @IsString() CORS_ORIGINS = '';
  @IsOptional() @IsString() PARTNER_API_ALLOWED_HOSTS = '';
  @IsOptional() @IsString() GOOGLE_MAPS_SERVER_API_KEY = '';
}

export function validate(config: Record<string, unknown>) {
  const value = plainToInstance(Environment, config, { enableImplicitConversion: true });
  const errors = validateSync(value, { skipMissingProperties: false });
  if (errors.length) throw new Error(`Invalid environment configuration: ${errors.map((error) => error.toString()).join('; ')}`);
  let redisUrl: URL;
  try {
    redisUrl = new URL(value.REDIS_URL);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }
  if (!['redis:', 'rediss:'].includes(redisUrl.protocol) || !redisUrl.hostname || redisUrl.hash) {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }
  const knownPlaceholder = /^(?:replace[-_ ]?with|change[-_ ]?me|generate[-_ ]?me|your[-_ ]|example[-_ ]|placeholder[-_ ])/i;
  if ([value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET].some((secret) => knownPlaceholder.test(secret.trim()))) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not use placeholder values');
  }
  if (value.JWT_ACCESS_SECRET.length < 32 || value.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must each contain at least 32 characters');
  }
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    throw new Error('JWT access and refresh secrets must be different');
  }
  if (value.NODE_ENV === 'production') {
    if (value.DEV_OTP_LOGGING === 'true') {
      throw new Error('DEV_OTP_LOGGING must be disabled in production');
    }
    const productionSecrets = [value.DB_PASSWORD, redisUrl.password];
    if (productionSecrets.some((secret) => !secret || knownPlaceholder.test(decodeURIComponent(secret)))) {
      throw new Error('Production database and Redis credentials must be configured and must not use placeholder values');
    }
  }
  if (!/^\d+(ms|s|m|h|d)$/.test(value.JWT_ACCESS_TTL)) {
    throw new Error('JWT_ACCESS_TTL must use a duration such as 15m or 1h');
  }
  const encryptionKey = Buffer.from(value.ENCRYPTION_KEY_BASE64, 'base64');
  if (encryptionKey.length !== 32 || encryptionKey.toString('base64') !== value.ENCRYPTION_KEY_BASE64) {
    throw new Error('ENCRYPTION_KEY_BASE64 must be a canonical base64 encoding of exactly 32 bytes');
  }
  if (encryptionKey.every((byte) => byte === 0)) {
    throw new Error('ENCRYPTION_KEY_BASE64 must not be an all-zero key');
  }
  return value;
}
