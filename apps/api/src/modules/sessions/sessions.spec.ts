import { BadRequestException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { assertSingleOutcome } from './sessions.service';
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
