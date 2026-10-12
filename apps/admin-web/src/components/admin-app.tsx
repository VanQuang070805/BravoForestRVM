'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Card, Field, Metric, PageTitle, Pill } from '@bravoforest/ui';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, clearAccessToken, markSignedOut } from '../lib/api';
import { rowsFrom, useApi } from '../lib/use-api';

type Row = Record<string, any>;

/* =========================================================================
   ICONS (CRISP MINIMALIST SVGS)
   ========================================================================= */

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="9" x="3" y="3" rx="1.5" />
      <rect width="7" height="5" x="14" y="3" rx="1.5" />
      <rect width="7" height="9" x="14" y="12" rx="1.5" />
      <rect width="7" height="5" x="3" y="16" rx="1.5" />
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconMachine() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M8 6h8" />
      <circle cx="12" cy="14" r="3" />
    </svg>
  );
}

function IconLocation() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconSession() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function IconVoucher() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

function IconPartner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 11 2 2 4-4" />
      <rect width="8" height="12" x="2" y="6" rx="2" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconRedemption() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconMaintenance() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

/* =========================================================================
   NAVIGATION SPECIFICATION
   ========================================================================= */

const navGroups = [
  {
    title: 'VẬN HÀNH',
    items: [
      { name: 'Tổng quan', path: 'dashboard', icon: <IconDashboard /> },
      { name: 'Phân tích', path: 'analytics', icon: <IconAnalytics /> },
      { name: 'Người dùng', path: 'users', icon: <IconUsers /> },
      { name: 'Máy tái chế', path: 'machines', icon: <IconMachine /> },
      { name: 'Địa điểm', path: 'locations', icon: <IconLocation /> },
    ]
  },
  {
    title: 'GIAO DỊCH',
    items: [
      { name: 'Phiên gửi chai', path: 'sessions', icon: <IconSession /> },
      { name: 'Kho Voucher', path: 'vouchers', icon: <IconVoucher /> },
      { name: 'Đối tác', path: 'partners', icon: <IconPartner /> },
      { name: 'Lượt đổi quà', path: 'redemptions', icon: <IconRedemption /> },
    ]
  },
  {
    title: 'HỆ THỐNG',
    items: [
      { name: 'Cảnh báo', path: 'alerts', icon: <IconAlert /> },
      { name: 'Lịch bảo trì', path: 'maintenance', icon: <IconMaintenance /> },
      { name: 'Cấu hình', path: 'settings', icon: <IconSettings /> },
    ]
  }
] as const;

const titles: Record<string, string> = {
  dashboard: 'Tổng quan',
  analytics: 'Phân tích vận hành',
  users: 'Quản lý người dùng',
  machines: 'Hệ thống máy tái chế',
  locations: 'Địa điểm đặt máy',
  sessions: 'Phiên giao dịch gửi chai',
  vouchers: 'Quản lý Voucher & Quà tặng',
  partners: 'Đối tác doanh nghiệp',
  redemptions: 'Lịch sử đổi quà',
  alerts: 'Cảnh báo & Sự cố',
  maintenance: 'Nhật ký bảo trì',
  settings: 'Cài đặt hệ thống'
};

const val = (o: Row, ...keys: string[]) => {
  for (const k of keys) {
    if (o?.[k] !== undefined && o[k] !== null) return o[k];
  }
  return '';
};

const fmtDate = (v: any) => v ? new Date(v).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/* =========================================================================
   STATUS BADGE RENDERER
   ========================================================================= */

function renderBadge(raw: any) {
  const str = String(raw ?? '').trim();
  const upper = str.toUpperCase();

  if (['ACTIVE', 'ONLINE', 'SUCCESS', 'RESOLVED', 'TRUE', '1'].includes(upper)) {
    return <span className="badge badge-green">{upper === 'ACTIVE' ? 'HOẠT ĐỘNG' : upper === 'ONLINE' ? 'TRỰC TUYẾN' : upper}</span>;
  }
  if (['LOCKED', 'OFFLINE', 'CRITICAL', 'ERROR', 'FAILED', 'FALSE', '0'].includes(upper)) {
    return <span className="badge badge-red">{upper === 'LOCKED' ? 'ĐÃ KHÓA' : upper === 'OFFLINE' ? 'NGOẠI TUYẾN' : upper}</span>;
  }
  if (['WARNING', 'PENDING', 'MAINTENANCE', 'MEDIUM', 'HIGH'].includes(upper)) {
    return <span className="badge badge-amber">{upper}</span>;
  }
  if (['CODE_POOL', 'PARTNER_API', 'LOW'].includes(upper)) {
    return <span className="badge badge-blue">{upper}</span>;
  }
  return <span className="badge badge-gray">{str || '—'}</span>;
}

/* =========================================================================
   GENERIC API MESSAGE & TABLE
   ========================================================================= */

function ApiMessage({ loading, error, empty, children }: { loading: boolean; error: string; empty?: boolean; children: ReactNode }) {
  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
        <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid #cbd5e1', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
        <div>Đang tải dữ liệu…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24, background: '#fef2f2', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, color: '#b91c1c' }}>
        <strong>Không thể tải dữ liệu</strong>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#ef4444' }}>{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="empty">
        <div className="empty-icon">📂</div>
        <strong style={{ display: 'block', fontSize: 15, color: '#334155' }}>Chưa có bản ghi nào</strong>
        <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>Dữ liệu hệ thống sẽ hiển thị tại đây khi có hoạt động phát sinh.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function Table({ heads, rows }: { heads: string[]; rows: (string | number | ReactNode)[][] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {heads.map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================================
   SHELL COMPONENT (SIDEBAR + TOPBAR + MAIN)
   ========================================================================= */

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<Row>();
  const [authError, setAuthError] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (isLogin) return;
    apiGet<Row>('/auth/me')
      .then(me => {
        if (!['ADMIN', 'TECHNICIAN'].includes(val(me, 'role', 'role_name'))) {
          setAuthError('Tài khoản không có quyền quản trị.');
          return;
        }
        setUser(me);
        setAuthError('');
      })
      .catch(e => {
        setUser(undefined);
        setAuthError(e instanceof Error ? e.message : 'Cần đăng nhập để tiếp tục.');
      });
  }, [isLogin, pathname]);

  const logout = async () => {
    markSignedOut();
    try {
      await apiPost('/auth/logout', {});
    } catch {
    } finally {
      clearAccessToken();
      setUser(undefined);
      router.push('/login');
    }
  };

  if (isLogin) return <>{children}</>;

  if (!user) {
    return (
      <div className="login-admin">
        <div className="card" style={{ width: 'min(460px, 100%)', padding: 36, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 auto 16px', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
            ✳
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>
            Hệ thống Quản trị BravoForest
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
            {authError || 'Đang xác thực thông tin tài khoản…'}
          </p>
          {authError && (
            <Link href="/login" className="button button-dark" style={{ width: '100%' }}>
              Đăng nhập quản trị →
            </Link>
          )}
        </div>
      </div>
    );
  }

  const currentSlug = pathname.replace(/^\//, '') || 'dashboard';

  return (
    <div className="admin-frame">
      {/* MINIMALIST LIGHT SIDEBAR */}
      <aside className={`admin-side ${open ? 'open' : ''}`}>
        <Link href="/dashboard" className="admin-side-brand">
          <div className="admin-brand-icon">✳</div>
          <div className="admin-brand-text">
            <span className="admin-brand-title">BravoForest</span>
            <span className="admin-brand-badge">Ops Console</span>
          </div>
        </Link>

        <div className="admin-nav-scroll">
          {navGroups.map(group => (
            <div key={group.title}>
              <div className="admin-label">{group.title}</div>
              <nav className="admin-nav">
                {group.items.map(({ name, path, icon }) => {
                  const isActive = pathname === `/${path}`;
                  return (
                    <Link
                      key={path}
                      href={`/${path}`}
                      className={isActive ? 'active' : ''}
                      onClick={() => setOpen(false)}
                    >
                      {icon}
                      <span>{name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="admin-side-footer">
          <div className="admin-status-indicator">
            <span className="admin-status-dot" />
            <span>Hệ thống trực tuyến</span>
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>v2.4.0</span>
        </div>
      </aside>

      {/* MAIN LAYOUT */}
      <div className="admin-main">
        {/* TOPBAR */}
        <header className="admin-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="button button-light mobile-menu"
              aria-label="Mở menu"
              onClick={() => setOpen(!open)}
            >
              ☰
            </button>
            <div className="admin-breadcrumb">
              <span>BravoForest</span>
              <span style={{ color: '#cbd5e1' }}>/</span>
              <strong>{titles[currentSlug] || 'Operations'}</strong>
            </div>
          </div>

          <div className="admin-tools">
            <div className="admin-user-pill">
              <div className="admin-avatar">
                {String(val(user, 'fullName', 'full_name') || 'AD').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <strong style={{ fontSize: 13, color: '#0f172a' }}>
                  {val(user, 'fullName', 'full_name') || 'Quản trị viên'}
                </strong>
                <span style={{ fontSize: 10.5, color: '#10b981', fontWeight: 700 }}>
                  {val(user, 'role', 'role_name') || 'ADMIN'}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="button button-light"
              style={{ padding: '7.5px 14px', fontSize: 12.5 }}
            >
              Đăng xuất
            </button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="admin-content">
          {children}
        </main>
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN PAGE
   ========================================================================= */

function Login() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const result = await apiPost<{ accessToken: string }>('/auth/login', {
        identifier: form.get('identifier'),
        password: form.get('password')
      });
      localStorage.setItem('bravoforest_admin_token', result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-admin">
      <div className="card" style={{ width: 'min(440px, 100%)', padding: 38 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 }}>
            ✳
          </div>
          <div>
            <h2 style={{ fontFamily: 'Manrope', fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a' }}>BravoForest</h2>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#10b981', textTransform: 'uppercase' }}>Operations Console</span>
          </div>
        </div>

        <h1 style={{ fontFamily: 'Manrope, sans-serif', fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>
          Đăng nhập quản trị
        </h1>
        <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 24px', lineHeight: 1.5 }}>
          Vui lòng nhập tài khoản có quyền ADMIN hoặc TECHNICIAN.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Email hoặc số điện thoại" name="identifier" placeholder="admin@bravoforest.com" required />
          <Field label="Mật khẩu" name="password" type="password" placeholder="••••••••" required />

          <button
            disabled={busy}
            className="button button-lime"
            style={{ marginTop: 8, padding: '12px 20px', fontSize: 14 }}
          >
            {busy ? 'Đang xác thực…' : 'Đăng nhập vào hệ thống →'}
          </button>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   DASHBOARD PAGE
   ========================================================================= */

function Dashboard() {
  const overview = useApi<unknown>('/admin/analytics/overview');
  const record = rowsFrom<Row>(overview.data)[0] ?? (overview.data as Row | undefined);
  const stats = record || {};
  const alerts = useApi<unknown>('/admin/alerts');
  const openAlerts = rowsFrom<Row>(alerts.data).filter(r => !val(r, 'resolved_at', 'resolvedAt'));

  return (
    <>
      <PageTitle
        eyebrow="TỔNG QUAN VẬN HÀNH"
        title="Trạng thái mạng lưới RVM"
        description="Theo dõi toàn bộ số liệu thời gian thực từ các điểm tiếp nhận bao bì."
        action={
          <Link className="button button-light" href="/analytics">
            Xem phân tích chi tiết ↗
          </Link>
        }
      />

      <ApiMessage loading={overview.loading} error={overview.error}>
        <div className="grid-3">
          <Metric
            label="Thành viên tích cực"
            value={Number(val(stats, 'users') || 0).toLocaleString('vi-VN')}
            detail="Tài khoản hoạt động trên toàn hệ thống"
            icon="👤"
          />
          <Metric
            label="Máy RVM trực tuyến"
            value={`${val(stats, 'machines_online') || 0} / ${val(stats, 'machines') || 0}`}
            detail="Thiết bị duy trì kết nối ổn định"
            icon="♻"
          />
          <Metric
            label="Phiên gửi trong ngày"
            value={Number(val(stats, 'sessions_today') || 0).toLocaleString('vi-VN')}
            detail={`${Number(val(stats, 'points_today') || 0).toLocaleString('vi-VN')} điểm phát hành hôm nay`}
            icon="⚡"
          />
        </div>
      </ApiMessage>

      <div className="section-head">
        <h2>Cảnh báo hệ thống cần xử lý ({openAlerts.length})</h2>
        <Link className="button button-light" href="/alerts" style={{ fontSize: 12.5, padding: '7px 14px' }}>
          Xem tất cả cảnh báo →
        </Link>
      </div>

      <div className="table-card">
        <ApiMessage loading={alerts.loading} error={alerts.error} empty={!openAlerts.length}>
          <Table
            heads={['Mức độ', 'Mã máy RVM', 'Mã cảnh báo', 'Thời gian ghi nhận']}
            rows={openAlerts.slice(0, 8).map(r => [
              renderBadge(val(r, 'severity')),
              <strong key="code" style={{ color: '#0f172a' }}>{val(r, 'machine_code', 'machineCode')}</strong>,
              val(r, 'code'),
              fmtDate(val(r, 'created_at', 'createdAt'))
            ])}
          />
        </ApiMessage>
      </div>
    </>
  );
}

/* =========================================================================
   GENERIC DATA PAGE (USERS, MACHINES, LOCATIONS, ETC.)
   ========================================================================= */

function DataPage({ route }: { route: string }) {
  const spec: Record<string, { path: string; heads: string[]; keys: string[] }> = {
    users: {
      path: '/admin/users',
      heads: ['Thành viên', 'Email / Số điện thoại', 'Điểm thưởng', 'Trạng thái', 'Thao tác'],
      keys: ['full_name', 'email', 'balance', 'status']
    },
    machines: {
      path: '/admin/machines',
      heads: ['Mã thiết bị', 'Địa điểm lắp đặt', 'Kết nối', 'Trạng thái vận hành', 'Thao tác'],
      keys: ['machine_code', 'location_name', 'connectivity', 'operational_status']
    },
    locations: {
      path: '/locations',
      heads: ['Tên địa điểm', 'Địa chỉ cụ thể', 'Số lượng máy', 'Trạng thái'],
      keys: ['name', 'address', 'machine_count', 'is_active']
    },
    sessions: {
      path: '/admin/sessions',
      heads: ['Mã phiên', 'Khách hàng', 'Mã máy', 'Trạng thái', 'Thời gian bắt đầu'],
      keys: ['session_id', 'full_name', 'machine_code', 'status', 'started_at']
    },
    vouchers: {
      path: '/admin/vouchers',
      heads: ['Tên Voucher', 'Mã ID', 'Điểm quy đổi', 'Trạng thái', 'Hạn sử dụng'],
      keys: ['title', 'voucher_id', 'points_cost', 'status', 'available_to']
    },
    partners: {
      path: '/admin/partners',
      heads: ['Tên đối tác', 'Mã định danh', 'Loại hình', 'Trạng thái'],
      keys: ['name', 'code', 'partner_type', 'status']
    },
    redemptions: {
      path: '/admin/redemptions',
      heads: ['Mã giao dịch', 'Khách hàng', 'Voucher', 'Trạng thái', 'Thời gian đổi'],
      keys: ['redemption_id', 'full_name', 'title', 'status', 'created_at']
    },
    alerts: {
      path: '/admin/alerts',
      heads: ['Mức độ', 'Mã máy', 'Mã lỗi / Cảnh báo', 'Thời gian', 'Thao tác'],
      keys: ['severity', 'machine_code', 'code', 'created_at']
    },
    maintenance: {
      path: '/admin/maintenance',
      heads: ['Mã máy', 'Kỹ thuật viên', 'Hạng mục bảo trì', 'Mô tả chi tiết', 'Ngày thực hiện'],
      keys: ['machine_code', 'full_name', 'maintenance_type', 'description', 'performed_at']
    }
  };

  const cfg = spec[route];
  const [search, setSearch] = useState('');
  const path = route === 'users' ? `/admin/users?search=${encodeURIComponent(search)}` : cfg.path;
  const result = useApi<unknown>(path);
  const records = rowsFrom<Row>(result.data);
  const visible = route === 'users'
    ? records
    : records.filter(r => Object.values(r).join(' ').toLowerCase().includes(search.toLowerCase()));

  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (route === 'machines') {
        await apiPost('/admin/machines', {
          machineCode: f.get('machineCode'),
          serialNumber: f.get('serialNumber') || undefined,
          model: f.get('model') || undefined
        });
      } else if (route === 'locations') {
        await apiPost('/admin/locations', {
          name: f.get('name'),
          address: f.get('address'),
          district: f.get('district') || undefined,
          city: f.get('city') || undefined,
          latitude: f.get('latitude') ? Number(f.get('latitude')) : undefined,
          longitude: f.get('longitude') ? Number(f.get('longitude')) : undefined
        });
      } else if (route === 'vouchers') {
        await apiPost('/admin/vouchers', {
          partnerId: Number(f.get('partnerId')),
          categoryId: Number(f.get('categoryId')),
          title: f.get('title'),
          pointsCost: Number(f.get('pointsCost')),
          fulfillmentType: f.get('fulfillmentType'),
          description: f.get('description') || undefined,
          status: 'ACTIVE'
        });
      } else if (route === 'partners') {
        await apiPost('/admin/partners', {
          code: f.get('code'),
          name: f.get('name'),
          partnerType: f.get('partnerType'),
          status: 'ACTIVE'
        });
      } else if (route === 'maintenance') {
        await apiPost('/admin/maintenance', {
          machineId: Number(f.get('machineId')),
          maintenanceType: f.get('maintenanceType'),
          description: f.get('description') || undefined
        });
      } else {
        throw new Error('Chức năng thêm mới chưa được mở cho mục này.');
      }
      setNotice({ msg: 'Đã lưu thông tin mới thành công.', type: 'success' });
      setFormOpen(false);
      result.refresh();
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Không thể lưu thông tin.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      await apiPatch(`/admin/users/${encodeURIComponent(id)}/status`, { status });
      setNotice({ msg: 'Đã cập nhật trạng thái người dùng.', type: 'success' });
      result.refresh();
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Không thể cập nhật trạng thái.', type: 'error' });
    }
  };

  const removeMachine = async (id: string) => {
    if (!confirm('Xác nhận ngừng vận hành máy RVM này?')) return;
    try {
      await apiDelete(`/admin/machines/${id}`);
      setNotice({ msg: 'Đã ngừng vận hành máy RVM.', type: 'success' });
      result.refresh();
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Không thể cập nhật máy.', type: 'error' });
    }
  };

  const resolve = async (id: string) => {
    try {
      await apiPost(`/admin/alerts/${id}/resolve`, {});
      setNotice({ msg: 'Đã đánh dấu xử lý cảnh báo thành công.', type: 'success' });
      result.refresh();
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Không thể xử lý cảnh báo.', type: 'error' });
    }
  };

  const createButton = ['machines', 'locations', 'vouchers', 'partners', 'maintenance'].includes(route);

  return (
    <>
      <PageTitle
        eyebrow="QUẢN TRỊ MẠNG LƯỚI"
        title={titles[route] || route}
        description={`Quản lý và điều phối dữ liệu ${titles[route]?.toLowerCase() || route} trên hệ thống.`}
        action={
          createButton ? (
            <button
              className={formOpen ? 'button button-light' : 'button button-dark'}
              onClick={() => setFormOpen(v => !v)}
            >
              {formOpen ? 'Đóng biểu mẫu ✕' : '＋ Thêm mới'}
            </button>
          ) : undefined
        }
      />

      {notice && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: 20,
            borderRadius: 10,
            fontSize: 13.5,
            background: notice.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${notice.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: notice.type === 'success' ? '#065f46' : '#b91c1c'
          }}
        >
          {notice.msg}
        </div>
      )}

      {/* DEDICATED SPACIOUS ADD FORM (NO OVERLAPPING!) */}
      {formOpen && (
        <div className="card" style={{ marginBottom: 28, border: '1px solid #cbd5e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontFamily: 'Manrope', fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              Thêm mới dữ liệu {titles[route]?.toLowerCase()}
            </h3>
            <span style={{ fontSize: 12, color: '#64748b' }}>Vui lòng điền đủ các trường bắt buộc (*)</span>
          </div>

          <form onSubmit={submit}>
            <div className="grid-3" style={{ marginBottom: 20 }}>
              {route === 'machines' ? (
                <>
                  <Field label="Mã máy RVM *" name="machineCode" placeholder="RVM-HN-042" required />
                  <Field label="Số Serial" name="serialNumber" placeholder="SRN-8829-X" />
                  <Field label="Model thiết bị" name="model" placeholder="EcoVision 3000" />
                </>
              ) : route === 'locations' ? (
                <>
                  <Field label="Tên địa điểm *" name="name" placeholder="Vincom Mega Mall" required />
                  <Field label="Địa chỉ cụ thể *" name="address" placeholder="54A Nguyễn Chí Thanh" required />
                  <Field label="Quận / Huyện" name="district" placeholder="Đống Đa" />
                  <Field label="Tỉnh / Thành phố" name="city" placeholder="Hà Nội" />
                  <Field label="Vĩ độ (Latitude)" name="latitude" type="number" step="any" placeholder="21.0285" />
                  <Field label="Kinh độ (Longitude)" name="longitude" type="number" step="any" placeholder="105.8542" />
                </>
              ) : route === 'vouchers' ? (
                <>
                  <Field label="Partner ID *" name="partnerId" type="number" placeholder="1" required />
                  <Field label="Category ID *" name="categoryId" type="number" placeholder="1" required />
                  <Field label="Tên Voucher *" name="title" placeholder="Giảm 20k Highlands Coffee" required />
                  <Field label="Điểm quy đổi *" name="pointsCost" type="number" min="1" placeholder="100" required />
                  <label className="field">
                    <span>Loại cấp voucher *</span>
                    <select name="fulfillmentType" style={{ height: 42 }}>
                      <option value="CODE_POOL">Mã Voucher có sẵn (Code Pool)</option>
                      <option value="PARTNER_API">Tạo qua API đối tác</option>
                      <option value="ACCOUNT_TOPUP">Nạp trực tiếp vào tài khoản</option>
                    </select>
                  </label>
                  <Field label="Mô tả voucher" name="description" placeholder="Áp dụng cho hóa đơn từ 50k" />
                </>
              ) : route === 'partners' ? (
                <>
                  <Field label="Mã đối tác *" name="code" placeholder="HIGHLANDS" required />
                  <Field label="Tên đối tác *" name="name" placeholder="Highlands Coffee" required />
                  <Field label="Loại đối tác *" name="partnerType" placeholder="BEVERAGE / RETAIL" required />
                </>
              ) : (
                <>
                  <Field label="Machine ID *" name="machineId" type="number" placeholder="1" required />
                  <Field label="Loại bảo trì *" name="maintenanceType" placeholder="ROUTINE_CHECK" required />
                  <Field label="Mô tả công việc" name="description" placeholder="Vệ sinh cụm cảm biến quang học" />
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="button button-light"
                onClick={() => setFormOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={busy}
                className="button button-lime"
              >
                {busy ? 'Đang lưu…' : 'Lưu dữ liệu →'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TOOLBAR: SEARCH & RECORD STATS */}
      <div className="section-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2>Danh sách ({visible.length})</h2>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            className="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm nhanh trong danh sách…"
            aria-label="Tìm kiếm"
          />
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      <div className="table-card">
        <ApiMessage loading={result.loading} error={result.error} empty={!visible.length}>
          <Table
            heads={cfg.heads}
            rows={visible.map(r => [
              ...cfg.keys.map(k => {
                const rawVal = val(r, k);
                if (k.endsWith('_at') || k === 'available_to') {
                  return fmtDate(rawVal);
                }
                if (['status', 'connectivity', 'operational_status', 'is_active', 'severity'].includes(k)) {
                  return renderBadge(rawVal);
                }
                return String(rawVal ?? '—');
              }),
              ...(route === 'users' ? [
                <select
                  aria-label="Đổi trạng thái"
                  key="action"
                  value={val(r, 'status')}
                  onChange={e => changeStatus(String(val(r, 'user_id', 'id')), e.target.value)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 12.5,
                    background: '#fff'
                  }}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="LOCKED">LOCKED</option>
                  <option value="DELETED">DELETED</option>
                </select>
              ] : route === 'machines' ? [
                <button
                  key="action"
                  className="button button-danger"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => removeMachine(String(val(r, 'machine_id', 'id')))}
                >
                  Ngừng máy
                </button>
              ] : route === 'alerts' && !val(r, 'resolved_at') ? [
                <button
                  key="action"
                  className="button button-lime"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => resolve(String(val(r, 'alert_id', 'id')))}
                >
                  Đánh dấu xử lý
                </button>
              ] : [])
            ])}
          />
        </ApiMessage>
      </div>
    </>
  );
}

/* =========================================================================
   ANALYTICS PAGE
   ========================================================================= */

function Analytics() {
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const daily = useApi<unknown>(`/admin/analytics/machines/daily?from=${from}&to=${to}`);
  const rows = rowsFrom<Row>(daily.data);

  return (
    <>
      <PageTitle
        eyebrow="BÁO CÁO PHÂN TÍCH"
        title="Thống kê hoạt động thu gom"
        description="Số liệu thu gom hàng ngày từ toàn bộ hệ thống máy RVM."
      />

      <div className="table-card">
        <ApiMessage loading={daily.loading} error={daily.error} empty={!rows.length}>
          <Table
            heads={['Ngày thu gom', 'Mã máy RVM', 'Số phiên thực hiện', 'Tổng khối lượng (kg)']}
            rows={rows.map(r => [
              fmtDate(val(r, 'day')).split(' ')[0],
              <strong key="code" style={{ color: '#0f172a' }}>{val(r, 'machine_code')}</strong>,
              `${Number(val(r, 'session_count') || 0).toLocaleString('vi-VN')} lượt`,
              `${Number(val(r, 'total_weight_kg') || 0).toFixed(2)} kg`
            ])}
          />
        </ApiMessage>
      </div>
    </>
  );
}

/* =========================================================================
   SETTINGS PAGE
   ========================================================================= */

function Settings() {
  const result = useApi<unknown>('/admin/settings');
  const rows = rowsFrom<Row>(result.data);
  const [notice, setNotice] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await apiPatch(`/admin/settings/${encodeURIComponent(String(f.get('key')))}`, {
        value: f.get('value'),
        description: f.get('description')
      });
      setNotice('Đã lưu cấu hình mới thành công.');
      result.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Không thể cập nhật cấu hình.');
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="CẤU HÌNH HỆ THỐNG"
        title="Tham số & Thiết lập môi trường"
        description="Quản lý các thông số vận hành và chính sách hệ sinh thái BravoForest."
      />

      <div className="table-card" style={{ marginBottom: 32 }}>
        <ApiMessage loading={result.loading} error={result.error} empty={!rows.length}>
          <Table
            heads={['Khóa cấu hình', 'Giá trị', 'Mô tả', 'Cập nhật lần cuối']}
            rows={rows.map(r => [
              <code key="key" style={{ background: '#f1f5f9', padding: '3px 6px', borderRadius: 4, color: '#0f172a' }}>
                {val(r, 'setting_key')}
              </code>,
              val(r, 'setting_value'),
              val(r, 'description'),
              fmtDate(val(r, 'updated_at'))
            ])}
          />
        </ApiMessage>
      </div>

      <div className="section-head">
        <h2>Cập nhật hoặc thêm cấu hình</h2>
      </div>

      <div className="card">
        <form onSubmit={submit}>
          <div className="grid-3" style={{ marginBottom: 20 }}>
            <Field label="Khóa tham số *" name="key" placeholder="POINT_RATE_PLASTIC" required />
            <Field label="Giá trị tham số *" name="value" placeholder="10" required />
            <Field label="Mô tả chi tiết" name="description" placeholder="Số điểm tặng cho mỗi chai PET" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="button button-dark">Lưu thay đổi tham số →</button>
          </div>
          {notice && (
            <p style={{ marginTop: 14, color: '#059669', fontSize: 13, fontWeight: 600 }}>{notice}</p>
          )}
        </form>
      </div>
    </>
  );
}

/* =========================================================================
   ROUTER SWITCHER
   ========================================================================= */

export function AdminPage({ route }: { route: string }) {
  if (route === 'login') return <Login />;
  if (route === 'dashboard') return <Dashboard />;
  if (route === 'analytics') return <Analytics />;
  if (route === 'settings') return <Settings />;
  if (['users', 'machines', 'locations', 'sessions', 'vouchers', 'partners', 'redemptions', 'alerts', 'maintenance'].includes(route)) {
    return <DataPage route={route} />;
  }

  return (
    <div className="empty">
      <div className="empty-icon">🔍</div>
      <h2 style={{ fontFamily: 'Manrope', fontSize: 20, color: '#0f172a', margin: '0 0 8px' }}>
        Không tìm thấy mục quản trị này
      </h2>
      <p style={{ color: '#64748b', margin: '0 0 20px' }}>Đường dẫn không tồn tại trong sơ đồ điều hướng.</p>
      <Link href="/dashboard" className="button button-dark">
        Về trang Tổng quan
      </Link>
    </div>
  );
}
