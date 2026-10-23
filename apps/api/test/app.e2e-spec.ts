import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  const tokens = { accessToken: 'access', refreshToken: 'refresh', expiresIn: '15m' };
  const auth = {
    register: jest.fn().mockResolvedValue(tokens),
    verifyRegistration: jest.fn().mockResolvedValue(tokens),
    login: jest.fn().mockResolvedValue(tokens),
    refresh: jest.fn().mockResolvedValue(tokens),
    logout: jest.fn().mockResolvedValue(undefined),
    profile: jest.fn(),
    updateProfile: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('issues an HttpOnly customer refresh cookie only for customer login', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/customer/login')
      .send({ identifier: 'customer@example.test', password: 'test-only-password' })
      .expect(201);

    expect(res.body).toEqual({ accessToken: 'access', expiresIn: '15m' });
    expect(res.headers['set-cookie'][0]).toMatch(/bf_customer_refresh_token=refresh;.*HttpOnly.*SameSite=Strict/);
    expect(res.headers['set-cookie'][0]).not.toMatch(/Max-Age=/i);
    expect(auth.login).toHaveBeenCalledWith(
      { identifier: 'customer@example.test', password: 'test-only-password' },
      'customer',
    );
  });

  it('issues an independent HttpOnly admin refresh cookie only for admin login', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ identifier: 'admin@example.test', password: 'test-only-password' })
      .expect(201);

    expect(res.headers['set-cookie'][0]).toMatch(/bf_admin_refresh_token=refresh;.*HttpOnly.*SameSite=Strict/);
    expect(res.headers['set-cookie'][0]).toMatch(/Max-Age=2592000/i);
    expect(auth.login).toHaveBeenLastCalledWith(
      { identifier: 'admin@example.test', password: 'test-only-password' },
      'admin',
    );
  });

  it.each([
    ['/auth/customer/refresh', 'bf_customer_refresh_token=customer-refresh', 'customer-refresh', 'customer', 'bf_customer_refresh_token'],
    ['/auth/admin/refresh', 'bf_customer_refresh_token=customer-refresh; bf_admin_refresh_token=admin-refresh', 'admin-refresh', 'admin', 'bf_admin_refresh_token'],
  ] as const)('refreshes only the %s session when both app cookies exist', async (path, cookie, token, audience, cookieName) => {
    const res = await request(app.getHttpServer()).post(path).set('Cookie', cookie).send({}).expect(201);

    expect(auth.refresh).toHaveBeenLastCalledWith(token, audience);
    expect(res.headers['set-cookie'][0]).toMatch(new RegExp(`${cookieName}=refresh;`));
  });

  it('customer logout clears only the customer refresh cookie', async () => {
    const res = await request(app.getHttpServer()).post('/auth/customer/logout').send({}).expect(201);
    const cookies = String(res.headers['set-cookie'] ?? '');
    expect(cookies).toMatch(/bf_customer_refresh_token=;/);
    expect(cookies).not.toMatch(/bf_admin_refresh_token=;/);
  });

  it('rejects malformed registration before service execution', () =>
    request(app.getHttpServer())
      .post('/auth/register')
      .send({ fullName: 'x', email: 'bad', password: 'short' })
      .expect(400));
});
