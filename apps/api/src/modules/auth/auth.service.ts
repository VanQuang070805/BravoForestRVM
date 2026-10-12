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

type RefreshPayload = { sub?: string; jti?: string; sid?: string };
type TokenResponse = { accessToken: string; refreshToken: string; expiresIn: string };

const CREATE_REFRESH_SESSION_SCRIPT = `
  if redis.call('exists', KEYS[1]) == 1 or redis.call('exists', KEYS[2]) == 1 then
    return 0
  end
  redis.call('set', KEYS[1], 'active', 'EX', ARGV[1])
  redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[1])
  return 1
`;

const ROTATE_REFRESH_TOKEN_SCRIPT = `
  if redis.call('get', KEYS[1]) ~= 'active' then return 0 end
  if redis.call('get', KEYS[2]) ~= ARGV[1] then return 0 end
  if redis.call('exists', KEYS[3]) == 1 then return 0 end
  redis.call('del', KEYS[2])
  redis.call('set', KEYS[3], ARGV[2], 'EX', ARGV[3])
  redis.call('expire', KEYS[1], ARGV[3])
  return 1
`;

const REVOKE_REFRESH_SESSION_SCRIPT = `
  if redis.call('get', KEYS[1]) == 'active' then
    redis.call('set', KEYS[1], 'revoked', 'EX', ARGV[1])
  end
  redis.call('del', KEYS[2])
  return 1
`;

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

  private async tokens(
    userId: string,
    sessionId: string = randomUUID(),
    rotateFrom?: { jti: string; digest: string },
  ): Promise<TokenResponse> {
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
      { sub: userId, role: user.role_name, jti: refreshJti, sid: sessionId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: refreshTtlSeconds },
    );
    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    const saved = rotateFrom
      ? await this.redis.eval(
          ROTATE_REFRESH_TOKEN_SCRIPT,
          3,
          `refresh-session:${sessionId}`,
          `refresh:${rotateFrom.jti}`,
          `refresh:${refreshJti}`,
          rotateFrom.digest,
          tokenDigest,
          String(refreshTtlSeconds),
        )
      : await this.redis.eval(
          CREATE_REFRESH_SESSION_SCRIPT,
          2,
          `refresh-session:${sessionId}`,
          `refresh:${refreshJti}`,
          String(refreshTtlSeconds),
          tokenDigest,
        );
    if (Number(saved) !== 1) {
      throw new UnauthorizedException('Refresh session was revoked or already used');
    }
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
    if (!payload.sub || !payload.jti || !payload.sid) throw new UnauthorizedException('Invalid refresh token');

    const [account] = await this.db.query(
      `SELECT user_id FROM users WHERE user_id=? AND status='ACTIVE' AND deleted_at IS NULL`,
      [payload.sub],
    );
    if (!account) {
      await this.redis.del(`refresh:${payload.jti}`);
      throw new UnauthorizedException('Account is inactive');
    }

    const digest = createHash('sha256').update(token).digest('hex');
    return this.tokens(payload.sub, payload.sid, { jti: payload.jti, digest });
  }

  async logout(token?: string) {
    if (!token) return;
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      return; // Expired or malformed tokens are already unusable.
    }

    if (payload.sid && payload.jti) {
      const ttl = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2_592_000);
      await this.redis.eval(
        REVOKE_REFRESH_SESSION_SCRIPT,
        2,
        `refresh-session:${payload.sid}`,
        `refresh:${payload.jti}`,
        String(ttl),
      );
    } else if (payload.jti) {
      await this.redis.del(`refresh:${payload.jti}`);
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
