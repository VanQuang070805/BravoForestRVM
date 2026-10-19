import { UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { AuthService } from './auth.service';

describe('bcrypt verifier compatibility', () => {
  it('normalizes MariaDB $2y$ hashes before comparison', async () => {
    const testPassword = 'local-test-only-password';
    const nodeHash = await hash(testPassword, 4);
    const mariaDbHash = nodeHash.replace(/^\$2b\$/, '$2y$');

    await expect(compare(testPassword, mariaDbHash.replace(/^\$2y\$/, '$2b$'))).resolves.toBe(true);
  });
});

describe('application-specific login roles', () => {
  const makeService = async (roleName: string) => {
    const passwordHash = await hash('local-only-password', 4);
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: '42',
        status: 'ACTIVE',
        deletedAt: null,
        passwordHash,
        roleId: 2,
      }),
    };
    const users = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([{ role_name: roleName }])
        .mockResolvedValueOnce([{ role_name: roleName, credential_version: 0 }]),
    };
    const jwt = { signAsync: jest.fn().mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token') };
    const redis = { eval: jest.fn().mockResolvedValue(1) };
    return { service: new AuthService(users as never, db as never, jwt as never, redis as never), users, jwt, redis };
  };

  it.each([
    ['customer', 'CUSTOMER'],
    ['admin', 'ADMIN'],
    ['admin', 'TECHNICIAN'],
  ] as const)('allows a %s app session for a %s account', async (audience, role) => {
    const { service } = await makeService(role);
    await expect(service.login({ identifier: 'person@example.test', password: 'local-only-password' }, audience))
      .resolves.toMatchObject({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it.each([
    ['customer', 'ADMIN'],
    ['customer', 'TECHNICIAN'],
    ['admin', 'CUSTOMER'],
  ] as const)('rejects a %s app session for a %s account', async (audience, role) => {
    const { service, users, jwt, redis } = await makeService(role);
    await expect(service.login({ identifier: 'person@example.test', password: 'local-only-password' }, audience))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.update).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });
});

describe('refresh session revocation', () => {
  it('uses one atomic Redis rotation that rejects a session revoked during refresh', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(0), del: jest.fn() };
    const db = {
      query: jest.fn().mockResolvedValueOnce([{ user_id: 42, role_name: 'CUSTOMER' }]).mockResolvedValueOnce([{ role_name: 'CUSTOMER' }]),
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: '42', jti: 'old-jti', sid: 'session-id' }),
      signAsync: jest.fn().mockResolvedValueOnce('new-access-token').mockResolvedValueOnce('new-refresh-token'),
    };
    const service = new AuthService({} as never, db as never, jwt as never, redis as never);

    await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);

    const [script, keyCount, sessionKey, previousTokenKey, nextTokenKey] = redis.eval.mock.calls[0];
    expect(keyCount).toBe(3);
    expect(sessionKey).toBe('refresh-session:session-id');
    expect(previousTokenKey).toBe('refresh:old-jti');
    expect(nextTokenKey).toMatch(/^refresh:/);
    expect(script).toContain("redis.call('get', KEYS[1]) ~= 'active'");
    expect(script).toContain("redis.call('get', KEYS[2]) ~= ARGV[1]");
  });

  it('revokes the stable refresh session id on logout', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(1), del: jest.fn() };
    const db = { query: jest.fn() };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: '42', jti: 'current-jti', sid: 'session-id' }) };
    const service = new AuthService({} as never, db as never, jwt as never, redis as never);

    await service.logout('refresh-token');

    const [script, keyCount, sessionKey, currentTokenKey] = redis.eval.mock.calls[0];
    expect(keyCount).toBe(2);
    expect(sessionKey).toBe('refresh-session:session-id');
    expect(currentTokenKey).toBe('refresh:current-jti');
    expect(script).toContain("redis.call('set', KEYS[1], 'revoked'");
  });

  it.each([
    ['ADMIN', 'customer'],
    ['CUSTOMER', 'admin'],
  ] as const)('rejects a %s session when refreshing as %s', async (role, targetAudience) => {
    const redis = { eval: jest.fn(), del: jest.fn() };
    const db = { query: jest.fn().mockResolvedValueOnce([{ user_id: 42, role_name: role, credential_version: 0 }]) };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: '42', jti: 'test-jti', sid: 'test-session', role }) };
    const service = new AuthService({} as never, db as never, jwt as never, redis as never);

    await expect(service.refresh('test-refresh-token', targetAudience)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('does not report logout success when Redis cannot persist revocation', async () => {
    const redis = { eval: jest.fn().mockRejectedValue(new Error('Redis unavailable')), del: jest.fn() };
    const db = { query: jest.fn() };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: '42', jti: 'current-jti', sid: 'session-id' }) };
    const service = new AuthService({} as never, db as never, jwt as never, redis as never);

    await expect(service.logout('refresh-token')).rejects.toThrow('Redis unavailable');
  });
});
