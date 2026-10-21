import { BadRequestException } from '@nestjs/common';
import { validateSync } from 'class-validator';
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

describe('machine active session', () => {
  it('returns the current depositing session for the authenticated machine', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ session_id: 42, status: 'DEPOSITING' }]) };
    const service = new SessionsService(db as any, {} as any, {} as any);

    await expect(service.active(7)).resolves.toEqual({ sessionId: '42', status: 'DEPOSITING' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("rs.status='DEPOSITING'"), [7]);
  });

  it('returns an idle state when the machine has no depositing session', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const service = new SessionsService(db as any, {} as any, {} as any);

    await expect(service.active(7)).resolves.toEqual({ sessionId: null, status: 'IDLE' });
  });
});
