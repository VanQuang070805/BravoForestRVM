import { validate } from './validation';

const validEnvironment = () => ({
  NODE_ENV: 'production',
  DB_HOST: '127.0.0.1',
  DB_PORT: 3306,
  DB_USER: 'app',
  DB_PASSWORD: 'local-test-db-password',
  DB_NAME: 'BravoForest',
  REDIS_URL: 'redis://:local-test-redis-password@127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'unit-test-access-key-with-sufficient-length',
  JWT_REFRESH_SECRET: 'unit-test-refresh-key-with-sufficient-length',
  ENCRYPTION_KEY_BASE64: Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64'),
});

describe('environment validation', () => {
  it('rejects known placeholder JWT signing keys', () => {
    expect(() => validate({
      ...validEnvironment(),
      JWT_ACCESS_SECRET: `replace-with-${'x'.repeat(40)}`,
    })).toThrow('must not use placeholder values');
  });

  it('rejects the public all-zero encryption key', () => {
    expect(() => validate({
      ...validEnvironment(),
      ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString('base64'),
    })).toThrow('must not be an all-zero key');
  });

  it('accepts distinct configured keys with a nonzero canonical encryption key', () => {
    expect(validate(validEnvironment()).NODE_ENV).toBe('production');
  });

  it('rejects placeholder credentials in production', () => {
    expect(() => validate({
      ...validEnvironment(),
      DB_PASSWORD: 'replace-with-db-password',
    })).toThrow('Production database and Redis credentials');

    expect(() => validate({
      ...validEnvironment(),
      REDIS_URL: 'redis://:replace-with-redis-password@127.0.0.1:6379',
    })).toThrow('Production database and Redis credentials');
  });
});
