import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validateSync } from 'class-validator';
import { RolesGuard } from '../../common/security';
import { SessionsController } from './sessions.controller';
import { SessionsService, assertSingleOutcome } from './sessions.service';
import { ClaimDto } from './sessions.dto';

describe('deposit outcome invariant', () => {
  it('accepts exactly one outcome', () => {
    expect(() => assertSingleOutcome(1, undefined)).not.toThrow();
    expect(() => assertSingleOutcome(undefined, 2)).not.toThrow();
  });

  it('rejects zero or two outcomes', () => {
    expect(() => assertSingleOutcome()).toThrow(BadRequestException);
    expect(() => assertSingleOutcome(1, 2)).toThrow(BadRequestException);
  });
});

describe('kiosk login QR token', () => {
  it('accepts only a 64-character hexadecimal session token', () => {
    const valid = new ClaimDto();
    valid.qrToken = 'a'.repeat(64);
    expect(validateSync(valid)).toHaveLength(0);

    const invalid = new ClaimDto();
    invalid.qrToken = 'not-a-session-token';
    expect(validateSync(invalid).length).toBeGreaterThan(0);
  });
});

describe('customer QR claim authorization', () => {
  const guard = new RolesGuard(new Reflector());
  const contextFor = (role?: string) => ({
    getHandler: () => SessionsController.prototype.claim,
    getClass: () => SessionsController,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  }) as any;

  it('allows a signed-in customer and rejects admin or anonymous requests', () => {
    expect(guard.canActivate(contextFor('CUSTOMER'))).toBe(true);
    expect(() => guard.canActivate(contextFor('ADMIN'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });

  it('rejects a customer without an active account and wallet', async () => {
    type MockManager = { query: jest.Mock };
    const manager: MockManager = { query: jest.fn().mockResolvedValue([]) };
    const db = {
      transaction: jest.fn((callback: (transactionManager: MockManager) => Promise<unknown>) => callback(manager)),
    };
    const service = new SessionsService(db as any, {} as any);

    await expect(service.claim('42', 'a'.repeat(64))).rejects.toThrow(UnauthorizedException);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });
});

describe('machine active session', () => {
  it('returns current deposit/finalization state from the database', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ session_id: 42, status: 'DEPOSITING', finish_requested_at: new Date() }]) };
    const db = { transaction: jest.fn((callback: (tx: typeof manager) => unknown) => callback(manager)) };
    const service = new SessionsService(db as any, {} as any);

    await expect(service.active(7)).resolves.toEqual({ sessionId: '42', status: 'DEPOSITING', finishRequested: true });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("rs.status IN ('DEPOSITING','PROCESSING')"), [7]);
  });

  it('returns an idle state when the machine has no depositing session', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const db = { transaction: jest.fn((callback: (tx: typeof manager) => unknown) => callback(manager)) };
    const service = new SessionsService(db as any, {} as any);

    await expect(service.active(7)).resolves.toEqual({ sessionId: null, status: 'IDLE' });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('recovers the active session and customer data from the database without a browser session token', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([{ session_id: '42' }])
        .mockResolvedValueOnce([{
          status: 'DEPOSITING', user_id: '9', finish_requested_at: null, linked: 1,
          expired: 0, accepted_items: 2, points: 20,
        }])
        .mockResolvedValueOnce([{
          full_name: 'Nguyen Van A', email: 'quang@example.com', wallet_status: 'ACTIVE', wallet_balance: 350,
        }])
        .mockResolvedValueOnce([{ item_id: '4', item_name: 'Chai PET 500 ml', accepted: 1, points: 10 }]),
    };
    const service = new SessionsService(db as any, {} as any);

    await expect(service.activeStatus(7)).resolves.toMatchObject({
      sessionId: '42', status: 'DEPOSITING', linked: true, acceptedItems: 2, points: 20,
      customer: {
        fullName: 'Nguyen Van A', maskedEmail: 'q…g@example.com', walletStatus: 'ACTIVE', walletBalance: 350,
      },
      recentItems: [{ item_name: 'Chai PET 500 ml' }],
    });
    expect(db.query).toHaveBeenCalledTimes(4);
    expect(db.query.mock.calls[0][0]).toContain("rs.status IN ('DEPOSITING','PROCESSING')");
    expect(db.query.mock.calls[1][0]).not.toContain('rs.qr_token');
  });

  it('stores the finish request transactionally and does not complete the session itself', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([{ status: 'DEPOSITING', finish_requested_at: null, has_items: 1 }])
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const db = { transaction: jest.fn((callback: (tx: typeof manager) => unknown) => callback(manager)) };
    const service = new SessionsService(db as any, {} as any);

    await expect(service.requestFinish(7, '42')).resolves.toEqual({
      status: 'DEPOSITING', finishRequested: true, idempotent: false,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query.mock.calls[1][0]).toContain('finish_requested_at=COALESCE');
  });

  it('only permits cancelling an unclaimed QR session', async () => {
    const db = { query: jest.fn().mockResolvedValue({ affectedRows: 0 }) };
    const service = new SessionsService(db as any, {} as any);

    await expect(service.cancel(7, '42', 'a'.repeat(64))).rejects.toThrow(ConflictException);
    expect(db.query.mock.calls[0][0]).toContain("rs.status='WAITING_LOGIN' AND rs.user_id IS NULL");
  });

  it('keeps wallet credit and completed status inside the same transaction', async () => {
    const manager = {
      query: jest.fn()
        .mockResolvedValueOnce([{ session_id: '42', status: 'PROCESSING', user_id: '9' }])
        .mockResolvedValueOnce([{ accepted_items: 2, points: 20 }])
        .mockResolvedValueOnce([{ wallet_id: '4', status: 'ACTIVE' }])
        .mockRejectedValueOnce(new Error('ledger insert failed')),
    };
    const db = { transaction: jest.fn((callback: (tx: typeof manager) => unknown) => callback(manager)) };
    const queue = { add: jest.fn() };
    const service = new SessionsService(db as any, queue as any);

    await expect(service.finalize(7, '42')).rejects.toThrow('ledger insert failed');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls.every(([, params]) => params !== undefined)).toBe(true);
    expect(manager.query).toHaveBeenCalledTimes(4);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
