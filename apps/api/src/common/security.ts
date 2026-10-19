import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Request } from 'express';
import { DataSource } from 'typeorm';

export type Principal = { sub: string; role: string; jti: string; ver?: number };
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly db: DataSource,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: Principal }>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException();

    let principal: Principal;
    try {
      principal = await this.jwt.verifyAsync<Principal>(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const [account] = await this.db.query(
      `SELECT u.status,u.deleted_at,u.credential_version,r.role_name FROM users u
       JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=?`,
      [principal.sub],
    );
    if (!account || account.status !== 'ACTIVE' || account.deleted_at) {
      throw new UnauthorizedException('Account is inactive');
    }
    if (Number(principal.ver ?? 0) !== Number(account.credential_version ?? 0)) {
      throw new UnauthorizedException('Credentials changed. Please sign in again.');
    }
    request.user = { ...principal, role: account.role_name };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: Principal }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}

export class SecretBox {
  private readonly key = Buffer.from(process.env.ENCRYPTION_KEY_BASE64 ?? '', 'base64');

  encrypt(text: string) {
    if (this.key.length !== 32) throw new Error('ENCRYPTION_KEY_BASE64 must decode to 32 bytes');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
  }

  decrypt(value: string) {
    if (this.key.length !== 32) throw new Error('ENCRYPTION_KEY_BASE64 must decode to 32 bytes');
    const data = Buffer.from(value, 'base64url');
    if (data.length < 28) throw new Error('Encrypted value is invalid');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }
}
