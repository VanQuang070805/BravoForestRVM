import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomInt, randomUUID } from 'crypto';
import { compare, hash } from 'bcrypt';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import { DataSource, Repository } from 'typeorm';
import { REDIS } from '../../common/redis.module';
import { User } from '../../database/core.entity';
import { ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

export type AuthAudience = 'customer' | 'admin';
type RefreshPayload = { sub?: string; jti?: string; sid?: string; ver?: number; role?: string };
type TokenResponse = { accessToken: string; refreshToken: string; expiresIn: string };

const roleAllowedForAudience = (role: string, audience: AuthAudience) =>
  audience === 'customer' ? role === 'CUSTOMER' : role === 'ADMIN' || role === 'TECHNICIAN';

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

const VERIFY_OTP_SCRIPT = `
  local stored = redis.call('get', KEYS[1])
  if not stored then return {0, ''} end
  local expected = ARGV[1]
  if #stored ~= #expected then
    local attempts = redis.call('incr', KEYS[2])
    if attempts == 1 then redis.call('expire', KEYS[2], ARGV[2]) end
    if attempts >= tonumber(ARGV[3]) then redis.call('del', KEYS[1], KEYS[2], KEYS[3], KEYS[4]) end
    return {-1, ''}
  end
  local difference = 0
  for index = 1, #stored do
    difference = difference + math.abs(string.byte(stored, index) - string.byte(expected, index))
  end
  if difference ~= 0 then
    local attempts = redis.call('incr', KEYS[2])
    if attempts == 1 then redis.call('expire', KEYS[2], ARGV[2]) end
    if attempts >= tonumber(ARGV[3]) then redis.call('del', KEYS[1], KEYS[2], KEYS[3], KEYS[4]) end
    return {-1, ''}
  end
  local pending = redis.call('get', KEYS[3]) or ''
  if ARGV[4] == '1' then redis.call('del', KEYS[1], KEYS[2], KEYS[3], KEYS[4]) end
  return {1, pending}
`;

const duplicateKey = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ER_DUP_ENTRY';

type OtpPurpose = 'registration' | 'password-reset';
type PendingRegistration = { fullName: string; email: string; phone: string | null; passwordHash: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly db: DataSource,
    private readonly jwt: JwtService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private otpKeys(purpose: OtpPurpose, email: string) {
    const digest = createHash('sha256').update(email).digest('hex');
    const prefix = `auth:otp:${purpose}:${digest}`;
    return { otp: prefix, attempts: `${prefix}:attempts`, pending: `${prefix}:pending`, cooldown: `${prefix}:cooldown` };
  }

  private otpDigest(purpose: OtpPurpose, email: string, code: string) {
    return createHmac('sha256', process.env.JWT_ACCESS_SECRET!).update(`${purpose}:${email}:${code}`).digest('hex');
  }

  private async sendOtp(email: string, code: string, purpose: OtpPurpose) {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const username = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    if (!host && !from && !username && !password && process.env.NODE_ENV === 'development' && process.env.DEV_OTP_LOGGING === 'true') {
      this.logger.warn(`Development OTP for ${email} (${purpose}): ${code}`);
      return;
    }
    if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535 || Boolean(username) !== Boolean(password)) {
      throw new ServiceUnavailableException('Dịch vụ gửi email chưa được cấu hình.');
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      ...(username && password ? { auth: { user: username, pass: password } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    const subject = purpose === 'registration' ? 'Xác nhận email BravoForest' : 'Đặt lại mật khẩu BravoForest';
    try {
      await transport.sendMail({
        from,
        to: email,
        subject,
        text: `Mã xác nhận BravoForest của bạn là ${code}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
        html: `<p>Mã xác nhận BravoForest của bạn:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
      });
    } catch {
      this.logger.warn('Could not send an authentication OTP email.');
      throw new ServiceUnavailableException('Không gửi được email xác nhận. Vui lòng thử lại sau.');
    } finally {
      transport.close();
    }
  }

  private async issueOtp(email: string, purpose: OtpPurpose, pending?: PendingRegistration) {
    const keys = this.otpKeys(purpose, email);
    if (!(await this.redis.set(keys.cooldown, '1', 'EX', 60, 'NX'))) {
      throw new HttpException('Vui lòng đợi trước khi gửi mã mới.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const writes = this.redis.multi()
      .set(keys.otp, this.otpDigest(purpose, email, code), 'EX', 600)
      .set(keys.attempts, '0', 'EX', 600);
    if (pending) writes.set(keys.pending, JSON.stringify(pending), 'EX', 600);
    else writes.del(keys.pending);
    await writes.exec();

    try {
      await this.sendOtp(email, code, purpose);
    } catch (error) {
      await this.redis.del(keys.otp, keys.attempts, keys.pending, keys.cooldown);
      throw error;
    }
    return { ok: true, expiresIn: 600 };
  }

  private async verifyOtp<T>(purpose: OtpPurpose, email: string, code: string, action: (pending?: string) => Promise<T>, consume = true) {
    const keys = this.otpKeys(purpose, email);
    const [status, pending] = await this.redis.eval(
      VERIFY_OTP_SCRIPT,
      4,
      keys.otp,
      keys.attempts,
      keys.pending,
      keys.cooldown,
      this.otpDigest(purpose, email, code),
      '600',
      '5',
      consume ? '1' : '0',
    ) as [number, string];
    if (Number(status) !== 1) throw new BadRequestException('Mã xác nhận không đúng hoặc đã hết hạn.');
    // Consume before protected work; the reset preflight keeps the code for the final confirmation.
    return action(pending || undefined);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone?.trim() || null;
    const [existing] = await this.db.query(
      `SELECT user_id FROM users WHERE LOWER(email)=? OR (? IS NOT NULL AND phone=?) LIMIT 1`,
      [email, phone, phone],
    );
    if (existing) throw new ConflictException('Email hoặc số điện thoại đã được sử dụng.');
    return this.issueOtp(email, 'registration', {
      fullName: dto.fullName.trim(), email, phone, passwordHash: await hash(dto.password, 12),
    });
  }

  async verifyRegistration(emailValue: string, code: string) {
    const email = emailValue.trim().toLowerCase();
    return this.verifyOtp('registration', email, code, async (value) => {
      if (!value) throw new BadRequestException('Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.');
      const pending = JSON.parse(value) as PendingRegistration;
      try {
        const userId = await this.db.transaction(async (manager) => {
          const [existing] = await manager.query('SELECT user_id FROM users WHERE LOWER(email)=? OR (? IS NOT NULL AND phone=?) LIMIT 1 FOR UPDATE', [email, pending.phone, pending.phone]);
          if (existing) throw new ConflictException('Email hoặc số điện thoại đã được sử dụng.');
          const [role] = await manager.query("SELECT role_id FROM roles WHERE role_name='CUSTOMER'");
          if (!role) throw new Error('Required CUSTOMER role is missing from the database seed');
          const result = await manager.query(
            `INSERT INTO users(role_id,full_name,email,phone,password_hash,status,email_verified_at)
             VALUES(?,?,?,?,?,'ACTIVE',NOW())`,
            [role.role_id, pending.fullName, pending.email, pending.phone, pending.passwordHash],
          );
          await manager.query("INSERT INTO wallets(user_id,status) VALUES(?,'ACTIVE')", [result.insertId]);
          return String(result.insertId);
        });
        return this.tokens(userId);
      } catch (error) {
        if (duplicateKey(error)) throw new ConflictException('Email hoặc số điện thoại đã được sử dụng.');
        throw error;
      }
    });
  }

  async requestPasswordReset(emailValue: string) {
    const email = emailValue.trim().toLowerCase();
    const [user] = await this.db.query(
      `SELECT user_id FROM users WHERE LOWER(email)=? AND status='ACTIVE' AND deleted_at IS NULL LIMIT 1`,
      [email],
    );
    if (!user) return { ok: true };
    await this.issueOtp(email, 'password-reset');
    return { ok: true };
  }

  async verifyPasswordReset(emailValue: string, code: string) {
    const email = emailValue.trim().toLowerCase();
    return this.verifyOtp('password-reset', email, code, async () => ({ ok: true }), false);
  }

  async resetPassword(emailValue: string, code: string, newPassword: string) {
    const email = emailValue.trim().toLowerCase();
    return this.verifyOtp('password-reset', email, code, async () => {
      const passwordHash = await hash(newPassword, 12);
      const result = await this.db.query(
        `UPDATE users SET password_hash=?,credential_version=credential_version+1
         WHERE LOWER(email)=? AND status='ACTIVE' AND deleted_at IS NULL`,
        [passwordHash, email],
      );
      if (!result.affectedRows) throw new BadRequestException('Không thể đổi mật khẩu cho tài khoản này.');
      return { ok: true };
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.users.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id=:id', { id }).getOne();
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) throw new UnauthorizedException();
    if (!(await compare(dto.currentPassword, user.passwordHash.replace(/^\$2y\$/, '$2b$')))) {
      throw new BadRequestException('Mật khẩu hiện tại chưa đúng.');
    }
    const result = await this.db.query(
      `UPDATE users SET password_hash=?,credential_version=credential_version+1
       WHERE user_id=? AND credential_version=? AND status='ACTIVE' AND deleted_at IS NULL`,
      [await hash(dto.newPassword, 12), id, user.credentialVersion],
    );
    if (!result.affectedRows) throw new BadRequestException('Mật khẩu đã thay đổi trong lúc xử lý. Vui lòng đăng nhập lại.');
    return { ok: true };
  }

  async login(dto: LoginDto, audience: AuthAudience = 'customer') {
    const identifier = dto.identifier.trim().toLowerCase();
    let user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email)=:identifier', { identifier })
      .getOne();

    // Staff can use the local part of their unique email as a short username
    // (for example, "admin" for admin@example.com). Customer login stays email-only.
    if (!user && /^[a-z0-9_.-]{1,60}$/.test(identifier)) {
      const matches = await this.db.query(
        `SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id
         WHERE r.role_name IN ('ADMIN','TECHNICIAN')
           AND LOWER(SUBSTRING_INDEX(u.email,'@',1)) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
         LIMIT 2`,
        [identifier],
      );
      if (matches.length === 1) {
        user = await this.users
          .createQueryBuilder('u')
          .addSelect('u.passwordHash')
          .where('u.id=:id', { id: matches[0].user_id })
          .getOne();
      }
    }

    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }
    const passwordMatches = await compare(dto.password, user.passwordHash.replace(/^\$2y\$/, '$2b$'));
    if (!passwordMatches) throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác.');

    const [role] = await this.db.query('SELECT role_name FROM roles WHERE role_id=?', [user.roleId]);
    if (!role || !roleAllowedForAudience(role.role_name, audience)) {
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác.');
    }
    await this.users.update(user.id, { lastLoginAt: new Date() });
    return this.tokens(String(user.id));
  }

  private async tokens(
    userId: string,
    sessionId: string = randomUUID(),
    rotateFrom?: { jti: string; digest: string; version: number },
  ): Promise<TokenResponse> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const accessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
    const refreshTtlSeconds = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 2_592_000);
    const [user] = await this.db.query(
      `SELECT r.role_name,u.credential_version FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE u.user_id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL`,
      [userId],
    );
    if (!user) throw new UnauthorizedException('Account is inactive');
    const credentialVersion = Number(user.credential_version ?? 0);
    if (rotateFrom && rotateFrom.version !== credentialVersion) {
      throw new UnauthorizedException('Credentials changed. Please sign in again.');
    }

    const accessToken = await this.jwt.signAsync(
      { sub: userId, role: user.role_name, jti: accessJti, ver: credentialVersion },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: accessTtl as never },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, role: user.role_name, jti: refreshJti, sid: sessionId, ver: credentialVersion },
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

  async refresh(token?: string, audience: AuthAudience = 'customer') {
    if (!token) throw new UnauthorizedException('Refresh token is required');
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (!payload.sub || !payload.jti || !payload.sid) throw new UnauthorizedException('Invalid refresh token');

    const [account] = await this.db.query(
      `SELECT u.user_id,u.credential_version,r.role_name FROM users u
       JOIN roles r ON r.role_id=u.role_id
       WHERE u.user_id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL`,
      [payload.sub],
    );
    if (!account) {
      await this.redis.del(`refresh:${payload.jti}`);
      throw new UnauthorizedException('Account is inactive');
    }
    if (!roleAllowedForAudience(account.role_name, audience)) {
      throw new UnauthorizedException('Refresh token is not valid for this application.');
    }
    const credentialVersion = Number(account.credential_version ?? 0);
    if (Number(payload.ver ?? 0) !== credentialVersion) {
      await this.redis.del(`refresh:${payload.jti}`);
      throw new UnauthorizedException('Credentials changed. Please sign in again.');
    }

    const digest = createHash('sha256').update(token).digest('hex');
    return this.tokens(payload.sub, payload.sid, { jti: payload.jti, digest, version: credentialVersion });
  }

  async logout(token?: string, audience: AuthAudience = 'customer') {
    if (!token) return;
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      return; // Expired or malformed tokens are already unusable.
    }

    if (payload.role && !roleAllowedForAudience(payload.role, audience)) return;

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
