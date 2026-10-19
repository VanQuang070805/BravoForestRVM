'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PageTitle } from '@bravoforest/ui';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { rowsFrom, useApi } from '../lib/use-api';
import GlideSelect from './react-bits/GlideSelect';

type Row = Record<string, any>;
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

const statusNames: Record<string, string> = {
  PENDING_REVIEW: 'Chờ duyệt', APPROVED: 'Đã duyệt', PAID: 'Đã chuyển', REJECTED: 'Từ chối · đã hoàn điểm', FAILED: 'Lỗi · đã hoàn điểm',
};
const vnd = (value: number | string) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const number = (value: number | string) => Number(value || 0).toLocaleString('vi-VN');
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function AdminCashoutsPage() {
  const policyQuery = useApi<Policy>('/admin/cashouts/policy');
  const [enabled, setEnabled] = useState(false);
  const [pointsPerStep, setPointsPerStep] = useState('');
  const [vndPerStep, setVndPerStep] = useState('');
  const [minPoints, setMinPoints] = useState('');
  const [maxPointsPerRequest, setMaxPointsPerRequest] = useState('');
  const [maxPointsPerDay, setMaxPointsPerDay] = useState('');
  const [policyBusy, setPolicyBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const value = policyQuery.data;
    if (!value) return;
    setEnabled(Boolean(value.enabled));
    setPointsPerStep(value.pointsPerStep ? String(value.pointsPerStep) : '');
    setVndPerStep(value.vndPerStep ? String(value.vndPerStep) : '');
    setMinPoints(value.minPoints ? String(value.minPoints) : '');
    setMaxPointsPerRequest(value.maxPointsPerRequest ? String(value.maxPointsPerRequest) : '');
    setMaxPointsPerDay(value.maxPointsPerDay ? String(value.maxPointsPerDay) : '');
  }, [policyQuery.data]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [searchTerm, status]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (searchTerm) params.set('search', searchTerm);
    if (status) params.set('status', status);
    return `/admin/cashouts?${params.toString()}`;
  }, [page, searchTerm, status]);
  const requestsQuery = useApi<unknown>(query);
  const requests = rowsFrom<Row>(requestsQuery.data);
  const pageInfo = requestsQuery.data && typeof requestsQuery.data === 'object' ? requestsQuery.data as Row : {};

  const savePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setPolicyBusy(true);
    try {
      const parse = (value: string) => value.trim() ? Number(value) : null;
      await apiPatch('/admin/cashouts/policy', {
        enabled,
        pointsPerStep: parse(pointsPerStep),
        vndPerStep: parse(vndPerStep),
        minPoints: parse(minPoints),
        maxPointsPerRequest: parse(maxPointsPerRequest),
        maxPointsPerDay: parse(maxPointsPerDay),
      });
      setNotice({ type: 'success', text: 'Đã lưu chính sách. Tỷ lệ mới chỉ áp dụng cho yêu cầu mới.' });
      policyQuery.refresh();
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu chính sách.' });
    } finally {
      setPolicyBusy(false);
    }
  };

  const fetchDetail = async (id: string) => {
    setDetailBusy(true);
    try {
      setSelected(await apiGet<Row>(`/admin/cashouts/${encodeURIComponent(id)}`));
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không tải được chi tiết yêu cầu.' });
    } finally {
      setDetailBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    if (String(selected?.cashoutId) === id) { setSelected(null); return; }
    setNotice(null);
    await fetchDetail(id);
  };

  const mutate = async (event: FormEvent<HTMLFormElement>, action: 'approve' | 'reject' | 'paid' | 'failed') => {
    event.preventDefault();
    if (!selected) return;
    setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      if (action === 'approve') await apiPost(`/admin/cashouts/${selected.cashoutId}/approve`);
      if (action === 'reject') await apiPost(`/admin/cashouts/${selected.cashoutId}/reject`, { reason: form.get('reason') });
      if (action === 'paid') await apiPost(`/admin/cashouts/${selected.cashoutId}/paid`, { transferReference: form.get('transferReference') });
      if (action === 'failed') await apiPost(`/admin/cashouts/${selected.cashoutId}/failed`, { reason: form.get('failureReason') });
      setNotice({ type: 'success', text: action === 'paid' ? 'Đã ghi nhận chuyển khoản thành công.' : action === 'failed' || action === 'reject' ? 'Đã cập nhật trạng thái và hoàn điểm cho khách.' : 'Đã duyệt yêu cầu. Hãy chuyển khoản rồi ghi nhận mã giao dịch.' });
      requestsQuery.refresh();
      await fetchDetail(String(selected.cashoutId));
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể cập nhật yêu cầu.' });
    }
  };

  return (
    <div className="admin-cashout-page">
      <PageTitle title="Đổi điểm thành tiền" description="Cấu hình tỷ lệ quy đổi và xử lý yêu cầu chi trả từ sổ cái điểm." />

      {notice && <div className={`admin-cashout-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

      <section className="admin-cashout-policy" aria-labelledby="cashout-policy-title">
        <div className="admin-cashout-section-head">
          <div><h2 id="cashout-policy-title">Chính sách quy đổi</h2><p>Thay đổi tỷ giá không làm thay đổi các yêu cầu đã gửi.</p></div>
          <span className={`admin-cashout-toggle-label ${enabled ? 'on' : ''}`}>{enabled ? 'Đang bật' : 'Đang tắt'}</span>
        </div>
        {policyQuery.loading ? <p className="admin-cashout-muted">Đang tải cấu hình…</p> : policyQuery.error ? <p className="admin-cashout-error">{policyQuery.error}</p> : (
          <form onSubmit={savePolicy}>
            <div className="admin-cashout-fields">
              <label><span>Điểm mỗi bậc quy đổi</span><input type="number" min="1" max="1000000000" step="1" value={pointsPerStep} onChange={(event) => setPointsPerStep(event.target.value)} placeholder="Ví dụ: 1000" /></label>
              <label><span>Tiền nhận mỗi bậc (VND)</span><input type="number" min="1" max="1000000000" step="1" value={vndPerStep} onChange={(event) => setVndPerStep(event.target.value)} placeholder="Ví dụ: 1000" /></label>
              <label><span>Tối thiểu mỗi lần (điểm)</span><input type="number" min="1" max="2000000000" step="1" value={minPoints} onChange={(event) => setMinPoints(event.target.value)} placeholder="Nhập số điểm" /></label>
              <label><span>Tối đa mỗi lần (điểm)</span><input type="number" min="1" max="2000000000" step="1" value={maxPointsPerRequest} onChange={(event) => setMaxPointsPerRequest(event.target.value)} placeholder="Nhập số điểm" /></label>
              <label><span>Hạn mức mỗi ngày (điểm)</span><input type="number" min="1" max="2000000000" step="1" value={maxPointsPerDay} onChange={(event) => setMaxPointsPerDay(event.target.value)} placeholder="Nhập số điểm" /></label>
              <label className="admin-cashout-switch"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Mở chức năng cho khách hàng</span></label>
            </div>
            <p className="admin-cashout-hint">Các mức tối thiểu và tối đa phải chia hết cho “điểm mỗi bậc”. Lưu cấu hình chưa chuyển tiền; admin vẫn cần duyệt và ghi nhận giao dịch chuyển khoản.</p>
            <div className="admin-cashout-policy-footer">
              <span>{policyQuery.data?.version ? `Phiên bản ${policyQuery.data.version}` : 'Chưa có chính sách lưu'}</span>
              <button type="submit" className="button button-dark" disabled={policyBusy || policyQuery.loading}>{policyBusy ? 'Đang lưu…' : 'Lưu chính sách'}</button>
            </div>
          </form>
        )}
      </section>

      <div className="admin-cashout-section-head admin-cashout-list-head">
        <div><h2>Yêu cầu chi trả</h2><p>{Number(pageInfo.total || 0).toLocaleString('vi-VN')} yêu cầu trong database</p></div>
        <div className="admin-cashout-filters">
          <input type="search" aria-label="Tìm yêu cầu đổi tiền" placeholder="Tìm mã, tên hoặc email…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <GlideSelect
            options={[
              { value: '', label: 'Tất cả trạng thái', tag: 'Tất cả' },
              { value: 'PENDING_REVIEW', label: 'Chờ duyệt', tag: 'Mới' },
              { value: 'APPROVED', label: 'Đã duyệt', tag: 'Chờ chi' },
              { value: 'PAID', label: 'Đã chuyển', tag: 'Thành công' },
              { value: 'REJECTED', label: 'Từ chối', tag: 'Hoàn điểm' },
              { value: 'FAILED', label: 'Lỗi chuyển khoản', tag: 'Lỗi' }
            ]}
            value={status}
            onChange={(val) => setStatus(val)}
            surfaceColor="#ffffff"
            highlightColor="rgba(22, 121, 75, 0.08)"
            textColor="#26352c"
            accentColor="#16794b"
            size="md"
            radius={9}
            menuWidth={200}
            placeholder="Lọc trạng thái"
            ariaLabel="Lọc trạng thái"
          />
        </div>
      </div>

      <section className="admin-cashout-table-wrap" aria-label="Danh sách yêu cầu đổi điểm thành tiền">
        {requestsQuery.loading ? <div className="admin-cashout-muted">Đang tải yêu cầu…</div> : requestsQuery.error ? <div className="admin-cashout-error">{requestsQuery.error}</div> : requests.length === 0 ? (
          <div className="admin-cashout-empty"><strong>Chưa có yêu cầu đổi tiền</strong><span>Yêu cầu mới sẽ xuất hiện tại đây sau khi khách gửi.</span></div>
        ) : (
          <div className="admin-cashout-scroll"><table className="admin-cashout-table">
            <thead><tr><th>Mã</th><th>Khách hàng</th><th>Số điểm</th><th>Số tiền</th><th>Ngân hàng</th><th>Trạng thái</th><th>Gửi lúc</th><th></th></tr></thead>
            <tbody>{requests.map((request) => {
              const id = String(request.cashout_id);
              return <tr key={id} className={String(selected?.cashoutId) === id ? 'selected' : ''}>
                <td>#{id}</td><td><strong>{request.full_name}</strong><small>{request.email}</small></td><td>{number(request.points)}</td><td className="amount">{vnd(request.amount_vnd)}</td>
                <td>{request.bank_name}<small>···· {request.account_last4}</small></td>
                <td><span className={`admin-cashout-status ${String(request.status).toLowerCase()}`}>{statusNames[String(request.status)] || request.status}</span></td>
                <td>{date(request.created_at)}</td><td><button type="button" className="admin-cashout-detail-button" onClick={() => void openDetail(id)} disabled={detailBusy}>{String(selected?.cashoutId) === id ? 'Đóng' : 'Chi tiết'}</button></td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
        <div className="admin-cashout-pagination"><span>Trang {page} / {Math.max(1, Number(pageInfo.totalPages || 1))}</span><div><button type="button" onClick={() => { setPage((value) => Math.max(1, value - 1)); setSelected(null); }} disabled={page <= 1 || requestsQuery.loading}>Trước</button><button type="button" onClick={() => { setPage((value) => value + 1); setSelected(null); }} disabled={page >= Number(pageInfo.totalPages || 1) || requestsQuery.loading}>Tiếp</button></div></div>
      </section>

      {selected && <section className="admin-cashout-detail" aria-labelledby="cashout-detail-title">
        <div className="admin-cashout-section-head"><div><h2 id="cashout-detail-title">Yêu cầu #{selected.cashoutId}</h2><p>{selected.fullName} · {selected.email}</p></div><span className={`admin-cashout-status ${String(selected.status).toLowerCase()}`}>{statusNames[String(selected.status)] || selected.status}</span></div>
        <div className="admin-cashout-recipient"><div><span>Ngân hàng</span><strong>{selected.bankName}</strong></div><div><span>Chủ tài khoản</span><strong>{selected.accountHolderName}</strong></div><div><span>Số tài khoản</span><strong className="account-number">{selected.accountNumber}</strong></div><div><span>Điểm / tiền nhận</span><strong>{number(selected.points)} điểm · {vnd(selected.amountVnd)}</strong></div></div>
        <p className="admin-cashout-snapshot">Tỷ giá đã chốt: {number(selected.pointsPerStep)} điểm = {vnd(selected.vndPerStep)} · Phiên bản chính sách {selected.policyVersion} · Gửi lúc {date(selected.createdAt)}</p>
        {selected.decisionReason && <p className="admin-cashout-detail-reason">Lý do: {selected.decisionReason}</p>}
        {selected.transferReference && <p className="admin-cashout-detail-reason">Mã giao dịch: {selected.transferReference}</p>}
        {selected.status === 'PENDING_REVIEW' && <div className="admin-cashout-actions">
          <form onSubmit={(event) => void mutate(event, 'approve')}><button type="submit" className="button button-dark">Duyệt yêu cầu</button></form>
          <form onSubmit={(event) => void mutate(event, 'reject')}><label><span>Lý do từ chối</span><input name="reason" required minLength={4} maxLength={255} placeholder="Nêu lý do để khách biết" /></label><button type="submit" className="button button-danger">Từ chối và hoàn điểm</button></form>
        </div>}
        {selected.status === 'APPROVED' && <div className="admin-cashout-actions">
          <form onSubmit={(event) => void mutate(event, 'paid')}><label><span>Mã giao dịch ngân hàng</span><input name="transferReference" required minLength={3} maxLength={120} placeholder="Mã tham chiếu từ ngân hàng" /></label><button type="submit" className="button button-dark">Xác nhận đã chuyển</button></form>
          <form onSubmit={(event) => void mutate(event, 'failed')}><label><span>Lý do chuyển khoản thất bại</span><input name="failureReason" required minLength={4} maxLength={255} placeholder="Ghi rõ xác nhận từ ngân hàng" /></label><label className="admin-cashout-confirm"><input name="notSent" type="checkbox" required /><span>Tôi xác nhận khoản này chưa được chuyển cho khách</span></label><button type="submit" className="button button-danger">Đánh dấu thất bại và hoàn điểm</button></form>
        </div>}
      </section>}
    </div>
  );
}
