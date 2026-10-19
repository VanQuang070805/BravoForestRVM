import { CashoutsService } from './cashouts.service';

describe('cash-out refunds', () => {
  const request = { wallet_id: 2, points: 500 };

  it('does not mint points when a legacy request has no debit ledger entry', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const service = new CashoutsService({} as never);
    const refund = (service as any).refund.bind(service);

    const pointsRefunded = await refund(
      manager,
      request,
      '1',
      'Yêu cầu cũ chưa trừ điểm',
      'admin-1',
      undefined,
      'REJECTED',
      'REJECT_CASHOUT',
    );

    expect(pointsRefunded).toBe(0);
    expect(manager.query.mock.calls.some(([sql]: [string]) => sql.includes("'CASHOUT_REFUND'"))).toBe(false);
    expect(manager.query.mock.calls.at(-1)?.[1]?.[4]).toContain('"pointsRefunded":0');
  });

  it('returns the requested points when the matching debit exists', async () => {
    const manager = {
      query: jest.fn().mockResolvedValueOnce([{ transaction_id: 12 }]).mockResolvedValue([]),
    };
    const service = new CashoutsService({} as never);
    const refund = (service as any).refund.bind(service);

    const pointsRefunded = await refund(
      manager,
      request,
      '2',
      'Chuyển khoản thất bại',
      'admin-1',
      undefined,
      'FAILED',
      'FAIL_CASHOUT',
    );

    expect(pointsRefunded).toBe(500);
    expect(manager.query.mock.calls.some(([sql]: [string]) => sql.includes("'CASHOUT_REFUND'"))).toBe(true);
  });
});
