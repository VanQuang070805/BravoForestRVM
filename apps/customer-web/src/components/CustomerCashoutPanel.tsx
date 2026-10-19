'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Banknote, Check, Clock3, ShieldCheck } from 'lucide-react';
import { apiPost } from '../lib/api';
import { rowsFrom, useApi } from '../lib/use-api';

type Policy = {
  enabled?: boolean;
  configured?: boolean;
  pointsPerStep?: number | null;
  vndPerStep?: number | null;
  minPoints?: number | null;
  maxPointsPerRequest?: number | null;
  maxPointsPerDay?: number | null;
  version?: number;
};
type Row = Record<string, any>;

const fmtNumber = (value: number | string) => Number(value || 0).toLocaleString('vi-VN');
const fmtVnd = (value: number | string) => `${fmtNumber(value)} ₫`;
const dateLabel = (value: unknown) => value ? new Date(String(value)).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const statusLabel: Record<string, string> = {
  PENDING_REVIEW: 'Đang chờ duyệt', APPROVED: 'Đã duyệt', PAID: 'Đã chuyển tiền',
  REJECTED: 'Đã từ chối · đã hoàn điểm', FAILED: 'Chuyển khoản lỗi · đã hoàn điểm',
};

export function CustomerCashoutPanel({ pointsBalance, onSubmitted }: { pointsBalance: number | null; onSubmitted: () => void }) {
  const policyQuery = useApi<Policy>('/cashouts/policy');
  const [page, setPage] = useState(1);
  const requestsQuery = useApi<unknown>(`/cashouts?page=${page}&pageSize=5`);
  const requests = rowsFrom<Row>(requestsQuery.data);
  const pageInfo = requestsQuery.data && typeof requestsQuery.data === 'object' ? requestsQuery.data as Row : {};
  const policy = policyQuery.data;
  const [points, setPoints] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const pointsPerStep = Number(policy?.pointsPerStep || 0);
  const vndPerStep = Number(policy?.vndPerStep || 0);
  const amountVnd = useMemo(() => {
    const value = Number(points);
    return value > 0 && pointsPerStep > 0 && value % pointsPerStep === 0
      ? (value / pointsPerStep) * vndPerStep
      : 0;
  }, [points, pointsPerStep, vndPerStep]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setNotice(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const numericPoints = Number(form.get('points'));
    if (!policy?.enabled || !policy.configured) return;
    if (!Number.isSafeInteger(numericPoints) || numericPoints < Number(policy.minPoints) || numericPoints > Number(policy.maxPointsPerRequest) || numericPoints % pointsPerStep !== 0) {
      setNotice({ kind: 'error', text: 'Số điểm chưa đúng giới hạn hoặc bước quy đổi.' });
      return;
    }
    if (pointsBalance === null || numericPoints > pointsBalance) {
      setNotice({ kind: 'error', text: 'Số dư điểm hiện tại không đủ.' });
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      await apiPost('/cashouts', {
        points: numericPoints,
        policyVersion: policy.version,
        idempotencyKey: idempotencyKeyRef.current ?? (idempotencyKeyRef.current = crypto.randomUUID()),
        bankName: form.get('bankName'),
        accountHolderName: form.get('accountHolderName'),
        accountNumber: form.get('accountNumber'),
        currentPassword: form.get('currentPassword'),
      });
      setNotice({ kind: 'success', text: 'Đã gửi yêu cầu. Điểm được giữ lại trong lúc chờ xử lý.' });
      idempotencyKeyRef.current = null;
      setPoints('');
      formElement.reset();
      requestsQuery.refresh();
      window.dispatchEvent(new Event('bravoforest:wallet-updated'));
      onSubmitted();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Không thể gửi yêu cầu lúc này.' });
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="customer-cashout" aria-labelledby="cashout-title">
      <div className="customer-cashout-heading">
        <div>
          <p className="customer-cashout-kicker">TỪ ĐIỂM THƯỞNG ĐẾN TÀI KHOẢN NGÂN HÀNG</p>
          <h2 id="cashout-title">Đổi điểm thành tiền</h2>
          <p className="customer-cashout-lead">Xem trước số tiền nhận được và theo dõi từng yêu cầu tại đây.</p>
        </div>
        <span className="customer-cashout-secure"><ShieldCheck size={16} aria-hidden="true" /> Thông tin nhận tiền được mã hóa</span>
      </div>

      <div className="customer-cashout-grid">
        {policyQuery.loading ? (
          <div className="cashout-state" role="status"><span className="cashout-skeleton" />Đang tải chính sách đổi điểm…</div>
        ) : policyQuery.error ? (
          <div className="cashout-state is-error" role="alert">Không tải được chính sách đổi tiền. Vui lòng thử tải lại trang.</div>
        ) : !policy?.enabled || !policy.configured ? (
          <div className="cashout-state" role="status">
            <Clock3 size={19} aria-hidden="true" />
            <div><strong>Tính năng đang tạm dừng</strong><span>BravoForest sẽ mở lại khi chính sách chi trả được cấu hình.</span></div>
          </div>
        ) : (
          <form
            className="cashout-form"
            onSubmit={submit}
            onChange={(event) => {
              const target = event.target;
              if (target instanceof HTMLInputElement && ['points', 'bankName', 'accountHolderName', 'accountNumber'].includes(target.name)) {
                idempotencyKeyRef.current = null;
              }
            }}
          >
            <div className="cashout-rate-line">
              <span>Tỷ lệ hiện tại</span>
              <strong>{fmtNumber(policy.pointsPerStep!)} điểm <ArrowRight size={14} aria-hidden="true" /> {fmtVnd(policy.vndPerStep!)}</strong>
            </div>
            <label className="cashout-field">
              <span>Số điểm muốn đổi</span>
              <input
                name="points" type="number" inputMode="numeric" required
                min={policy.minPoints!} max={Math.min(Number(policy.maxPointsPerRequest), pointsBalance ?? 0)}
                step={pointsPerStep} value={points} onChange={(event) => setPoints(event.target.value)}
                placeholder={`Tối thiểu ${fmtNumber(policy.minPoints!)} điểm`}
                aria-describedby="cashout-limits cashout-preview"
              />
              <small id="cashout-limits">Tối đa {fmtNumber(policy.maxPointsPerRequest!)} điểm/lần · {fmtNumber(policy.maxPointsPerDay!)} điểm/ngày</small>
            </label>
            <div className="cashout-preview" id="cashout-preview" aria-live="polite">
              <span>Tiền dự kiến nhận</span>
              <strong>{amountVnd > 0 ? fmtVnd(amountVnd) : '—'}</strong>
              <small>Điểm phải theo bội số {fmtNumber(pointsPerStep)}.</small>
            </div>
            <div className="cashout-field-grid">
              <label className="cashout-field"><span>Ngân hàng</span><input name="bankName" required minLength={2} maxLength={100} autoComplete="organization" placeholder="Tên ngân hàng" /></label>
              <label className="cashout-field"><span>Chủ tài khoản</span><input name="accountHolderName" required minLength={2} maxLength={120} autoComplete="name" placeholder="Tên trên tài khoản" /></label>
            </div>
            <label className="cashout-field"><span>Số tài khoản</span><input name="accountNumber" required minLength={6} maxLength={34} inputMode="numeric" pattern="[0-9]{6,34}" autoComplete="off" placeholder="Chỉ nhập chữ số" /></label>
            <label className="cashout-field"><span>Xác nhận bằng mật khẩu hiện tại</span><input name="currentPassword" type="password" required minLength={8} maxLength={72} autoComplete="current-password" placeholder="Mật khẩu tài khoản BravoForest" /></label>
            <label className="cashout-consent"><input name="acceptPolicy" type="checkbox" required /><span>Tôi xác nhận tỷ giá và số tiền dự kiến ở trên. Điểm sẽ được trừ khi gửi yêu cầu; nếu bị từ chối hoặc chuyển khoản thất bại, điểm sẽ được hoàn vào ví.</span></label>
            {notice && <p className={`cashout-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
            <button className="cashout-submit" type="submit" disabled={busy || !amountVnd || pointsBalance === null || Number(points) > pointsBalance}>
              {busy ? 'Đang gửi yêu cầu…' : <>Gửi yêu cầu đổi tiền <ArrowRight size={16} aria-hidden="true" /></>}
            </button>
          </form>
        )}

        <div className="cashout-history">
            <div className="cashout-history-title"><div><Banknote size={18} aria-hidden="true" /><h3>Lịch sử yêu cầu</h3></div><span>{Number(pageInfo.total || 0).toLocaleString('vi-VN')}</span></div>
            {requestsQuery.loading ? <div className="cashout-empty">Đang tải lịch sử…</div> : requestsQuery.error ? <div className="cashout-empty is-error">Không tải được lịch sử đổi tiền.</div> : requests.length === 0 ? (
              <div className="cashout-empty"><Check size={19} aria-hidden="true" /><strong>Chưa có yêu cầu nào</strong><span>Các lần đổi điểm sẽ xuất hiện tại đây.</span></div>
            ) : (
              <div className="cashout-history-list">
                {requests.map((request) => {
                  const status = String(request.status || '');
                  return <article className="cashout-history-row" key={request.cashout_id}>
                    <div className="cashout-history-row-top"><strong>{fmtVnd(request.amount_vnd)}</strong><span className={`cashout-status ${status.toLowerCase()}`}>{statusLabel[status] || status}</span></div>
                    <p>{fmtNumber(request.points)} điểm · {String(request.bank_name || 'Ngân hàng')} ···· {String(request.account_last4 || '')}</p>
                    <time>{dateLabel(request.created_at)}</time>
                    {request.decision_reason && <small className="cashout-history-reason">{String(request.decision_reason)}</small>}
                    {request.transfer_reference && <small className="cashout-history-reason">Mã chuyển khoản: {String(request.transfer_reference)}</small>}
                  </article>;
                })}
              </div>
            )}
            <div className="cashout-pagination">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || requestsQuery.loading}>Trước</button>
              <span>{page} / {Math.max(1, Number(pageInfo.totalPages || 1))}</span>
              <button type="button" onClick={() => setPage((value) => value + 1)} disabled={page >= Number(pageInfo.totalPages || 1) || requestsQuery.loading}>Tiếp</button>
            </div>
        </div>
      </div>
    </section>
  );
}
