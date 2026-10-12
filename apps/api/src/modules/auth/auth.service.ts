import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { compare, hash } from 'bcrypt';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { REDIS } from '../../common/redis.module';
import { User } from '../../database/core.entity';
import { LoginDto, RegisterDto } from './auth.dto';

type RefreshPayload = { sub?: string; jti?: string };
type TokenResponse = { accessToken: string; refreshToken: string; expiresIn: string };

const duplicateKey = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ER_DUP_ENTRY';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly db: DataSource,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email?.trim().toLowerCase() ?? null;
    const phone = dto.phone?.trim() ?? null;
    const passwordHash = await hash(dto.password, 12);

    try {
      const userId = await this.db.transaction(async (manager) => {
        const [existing] = await manager.query(
          `SELECT user_id FROM users
           WHERE (? IS NOT NULL AND LOWER(email)=?) OR (? IS NOT NULL AND phone=?)
           LIMIT 1 FOR UPDATE`,
          [email, email, phone, phone],
        );
        if (existing) throw new ConflictException('Email or phone already exists');

        const [role] = await manager.query("SELECT role_id FROM roles WHERE role_name='CUSTOMER'");
        if (!role) throw new Error('Required CUSTOMER role is missing from the database seed');
        const result = await manager.query(
          `INSERT INTO users(role_id,full_name,email,phone,password_hash,status)
           VALUES(?,?,?, ?,?,'ACTIVE')`,
          [role.role_id, dto.fullName.trim(), email, phone, passwordHash],
        );
        await manager.query("INSERT INTO wallets(user_id,status) VALUES(?,'ACTIVE')", [result.insertId]);
        return String(result.insertId);
      });

      return this.tokens(userId);
    } catch (error) {
      if (duplicateKey(error)) throw new ConflictException('Email or phone already exists');
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email)=LOWER(:identifier) OR u.phone=:identifier', { identifier })
      .getOne();

    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordMatches = await compare(dto.password, user.passwordHash.replace(/^\$2y\$/, '$2b$'));
    if (!passwordMatches) throw new UnauthorizedException('Invalid credentials');

    const [role] = await this.db.query('SELECT role_name FROM roles WHERE role_id=?', [user.roleId]);
    if (!role) throw new UnauthorizedException('Invalid credentials');
    await this.users.update(user.id, { lastLoginAt: new Date() });
    return this.tokens(String(user.id));
  }

  private async tokens(userId: string): Promise<TokenResponse> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const accessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
    const refreshTtlSeconds = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2_592_000);
    const [user] = await this.db.query(
      `SELECT r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE u.user_id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL`,
      [userId],
    );
    if (!user) throw new UnauthorizedException('Account is inactive');

    const accessToken = await this.jwt.signAsync(
      { sub: userId, role: user.role_name, jti: accessJti },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: accessTtl as never },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, role: user.role_name, jti: refreshJti },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: refreshTtlSeconds },
    );
    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    await this.redis.set(`refresh:${refreshJti}`, tokenDigest, 'EX', refreshTtlSeconds, 'NX');
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException('Refresh token is required');
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!payload.sub || !payload.jti) throw new UnauthorizedException('Invalid refresh token');

    const [account] = await this.db.query(
      `SELECT user_id FROM users WHERE user_id=? AND status='ACTIVE' AND deleted_at IS NULL`,
      [payload.sub],
    );
    if (!account) {
      await this.redis.del(`refresh:${payload.jti}`);
      throw new UnauthorizedException('Account is inactive');
    }

    const digest = createHash('sha256').update(token).digest('hex');
    const consumed = await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      `refresh:${payload.jti}`,
      digest,
    );
    if (Number(consumed) !== 1) throw new UnauthorizedException('Refresh token was already used or revoked');
    return this.tokens(payload.sub);
  }

  async logout(token?: string) {
    if (!token) return;
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: process.env.JWT_REFRESH_SECRET });
      if (payload.jti) await this.redis.del(`refresh:${payload.jti}`);
    } catch {
      // Expired or malformed tokens are already unusable.
    }
  }

  async profile(id: string) {
    const [user] = await this.db.query(
      `SELECT u.user_id,u.full_name,u.email,u.phone,u.status,u.created_at,r.role_name
       FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE u.user_id=? AND u.deleted_at IS NULL`,
      [id],
    );
    if (!user) throw new UnauthorizedException();
    const [wallet] = await this.db.query('SELECT wallet_id,status FROM wallets WHERE user_id=?', [id]);
    const [balance] = await this.db.query('SELECT balance,total_in,total_out FROM v_wallet_balance WHERE user_id=?', [id]);
    return { ...user, wallet: wallet ? { ...wallet, ...balance } : null };
  }

  async updateProfile(id: string, dto: { fullName?: string; phone?: string }) {
    const changes: Array<[string, string]> = [];
    if (dto.fullName !== undefined) changes.push(['full_name', dto.fullName.trim()]);
    if (dto.phone !== undefined) changes.push(['phone', dto.phone.trim()]);
    if (!changes.length) throw new BadRequestException('No changes supplied');

    await this.db.transaction(async (manager) => {
      const [user] = await manager.query('SELECT user_id FROM users WHERE user_id=? AND status=\'ACTIVE\' FOR UPDATE', [id]);
      if (!user) throw new UnauthorizedException('Account is inactive');
      if (dto.phone) {
        const [duplicate] = await manager.query('SELECT user_id FROM users WHERE phone=? AND user_id<>?', [dto.phone.trim(), id]);
        if (duplicate) throw new ConflictException('Phone number already exists');
      }
      await manager.query(`UPDATE users SET ${changes.map(([field]) => `${field}=?`).join(',')} WHERE user_id=?`, [
        ...changes.map(([, value]) => value),
        id,
      ]);
    });
    return this.profile(id);
  }
}
