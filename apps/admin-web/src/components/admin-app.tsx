'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Field, Metric, PageTitle } from '@bravoforest/ui';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, clearAccessToken, markSignedOut, setAccessToken, getCachedAdminUser, setCachedAdminUser } from '../lib/api';
import { rowsFrom, useApi } from '../lib/use-api';
import { AdminCashoutsPage } from './AdminCashoutsPage';
import {
  BranchedMenu,
  SwipeRow,
  SpotlightCard,
  FadeContent,
  GlideSelect,
  type SwipeRowAction
} from './react-bits';

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

/* =========================================================================
   NAVIGATION SPECIFICATION
   ========================================================================= */

const navGroups = [
  {
    title: 'VẬN HÀNH',
    items: [
      { name: 'Tổng quan', path: 'dashboard', icon: <IconDashboard /> },
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
      { name: 'Đổi điểm thành tiền', path: 'cashouts', icon: <IconRedemption /> },
    ]
  }
] as const;

const titles: Record<string, string> = {
  dashboard: 'Tổng quan',
  users: 'Quản lý người dùng',
  machines: 'Hệ thống máy tái chế',
  locations: 'Địa điểm đặt máy',
  sessions: 'Phiên giao dịch gửi chai',
  vouchers: 'Quản lý Voucher & Quà tặng',
  partners: 'Đối tác doanh nghiệp',
  redemptions: 'Lịch sử đổi quà',
  cashouts: 'Đổi điểm thành tiền'
};

const val = (o: Row | undefined | null, ...keys: string[]) => {
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

function ApiMessage({
  loading,
  error,
  empty,
  emptyText,
  children
}: {
  loading: boolean;
  error: string;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
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
        <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>{emptyText || 'Dữ liệu hệ thống sẽ hiển thị tại đây khi có hoạt động phát sinh.'}</p>
      </div>
    );
  }
  return <>{children}</>;
}

function Table({ heads, rows }: { heads: string[]; rows: (string | number | ReactNode)[][] }) {
  return (
    <div className="table-wrap" style={{ paddingBottom: 70 }}>
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
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<Row | undefined>(undefined);
  const [authError, setAuthError] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === '/login';

  useEffect(() => {
    setMounted(true);
    const cached = getCachedAdminUser();
    if (cached) setUser(cached);
  }, []);

  useEffect(() => {
    if (isLogin) return;
    let active = true;
    apiGet<Row>('/auth/admin/me')
      .then(me => {
        if (!active) return;
        if (!['ADMIN', 'TECHNICIAN'].includes(val(me, 'role', 'role_name'))) {
          clearAccessToken();
          markSignedOut();
          setAuthError('Tài khoản không có quyền quản trị.');
          setUser(undefined);
          setCachedAdminUser(undefined);
          return;
        }
        setUser(me);
        setCachedAdminUser(me);
        setAuthError('');
      })
      .catch(e => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 403) {
          clearAccessToken();
          setCachedAdminUser(undefined);
          setUser(undefined);
          setAuthError('Tài khoản không có quyền quản trị.');
          return;
        }
        if (!getCachedAdminUser()) {
          setUser(undefined);
          setAuthError(e instanceof Error ? e.message : 'Cần đăng nhập để tiếp tục.');
        }
      });
    return () => { active = false; };
  }, [isLogin]);

  useEffect(() => {
    if (val(user, 'role', 'role_name') === 'TECHNICIAN' && pathname !== '/machines') {
      router.replace('/machines');
    }
  }, [pathname, router, user]);

  const logout = async () => {
    markSignedOut();
    setCachedAdminUser(undefined);
    try {
      await apiPost('/auth/admin/logout', {});
    } catch {
    } finally {
      clearAccessToken();
      setUser(undefined);
      router.push('/login');
    }
  };

  if (isLogin) return <>{children}</>;

  if (!mounted || !user) {
    return (
      <div className="login-admin">
        <div className="card" style={{ width: 'min(460px, 100%)', padding: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#edf5ee', border: '1px solid #dde7de', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <img src="/icon.png" alt="BravoForest" width={26} height={26} style={{ objectFit: 'contain' }} />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Be Vietnam Pro', sans-serif", fontSize: 20, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Hệ thống Quản trị BravoForest
              </h1>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#16794b', textTransform: 'uppercase' }}>
                Trung tâm Vận hành & Giám sát
              </span>
            </div>
          </div>
          <p style={{ color: '#475569', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
            {authError || 'Đang xác thực thông tin tài khoản…'}
          </p>
          {authError && (
            <Link href="/login" className="button button-dark" style={{ width: '100%' }}>
              Đăng nhập quản trị
            </Link>
          )}
        </div>
      </div>
    );
  }

  const currentSlug = pathname.replace(/^\//, '') || 'dashboard';
  const userRole = String(val(user, 'role', 'role_name'));
  const visibleNavGroups = userRole === 'TECHNICIAN'
    ? navGroups.map((group) => ({ ...group, items: group.items.filter((item) => item.path === 'machines') })).filter((group) => group.items.length)
    : navGroups;

  if (userRole === 'TECHNICIAN' && currentSlug !== 'machines') {
    return <div className="login-admin"><div className="card">Đang mở danh sách máy được phân quyền…</div></div>;
  }

  return (
    <div className="admin-frame">
      {/* MINIMALIST LIGHT SIDEBAR */}
      <aside className={`admin-side ${open ? 'open' : ''}`}>
        <Link href="/dashboard" className="admin-side-brand">
          <div className="admin-brand-icon">
            <img src="/icon.png" alt="BravoForest" width={28} height={28} />
          </div>
          <div className="admin-brand-text">
            <span className="admin-brand-title">BravoForest</span>
            <span className="admin-brand-badge">Trung tâm Vận hành</span>
          </div>
        </Link>

        <div className="admin-nav-scroll" style={{ padding: '6px 10px' }}>
          <BranchedMenu
            items={visibleNavGroups.map((group) => ({
              label: group.title,
              children: group.items.map((item) => ({
                value: item.path,
                label: item.name,
                icon: item.icon
              }))
            }))}
            defaultOpen={[0, 1, 2]}
            active={currentSlug}
            onSelect={(selectedPath) => {
              router.push(`/${selectedPath}`);
              setOpen(false);
            }}
            accentColor="#15803d"
            lineColor="#e2e8f0"
            color="#0f172a"
            width={240}
          />
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
              <strong>{titles[currentSlug] || 'Vận hành'}</strong>
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
                  {val(user, 'role', 'role_name') || 'QUẢN TRỊ'}
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
        <main className="admin-content" key={currentSlug} style={{ animation: 'adminFadeIn 0.16s ease-out' }}>
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
      const result = await apiPost<{ accessToken: string }>('/auth/admin/login', {
        identifier: form.get('identifier'),
        password: form.get('password')
      });
      setAccessToken(result.accessToken);
      const me = await apiGet<Row>('/auth/admin/me');
      const role = String(val(me, 'role', 'role_name'));
      if (!['ADMIN', 'TECHNICIAN'].includes(role)) {
        clearAccessToken();
        throw new Error('Tài khoản không có quyền truy cập trang vận hành.');
      }
      setCachedAdminUser(me);
      router.push(role === 'TECHNICIAN' ? '/machines' : '/dashboard');
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
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#edf5ee', border: '1px solid #dde7de', display: 'grid', placeItems: 'center' }}>
            <img src="/icon.png" alt="BravoForest" width={30} height={30} style={{ objectFit: 'contain' }} />
          </div>
          <div>
            <h2 style={{ fontFamily: "'Be Vietnam Pro', 'Inter', sans-serif", fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a' }}>BravoForest</h2>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#16794b', textTransform: 'uppercase' }}>Trung tâm Vận hành</span>
          </div>
        </div>

        <h1 style={{ fontFamily: "'Be Vietnam Pro', 'Inter', sans-serif", fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>
          Đăng nhập quản trị
        </h1>
        <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 24px', lineHeight: 1.5 }}>
          Vui lòng nhập tài khoản có quyền ADMIN hoặc TECHNICIAN.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Tên đăng nhập hoặc email" name="identifier" type="text" autoComplete="username" placeholder="admin hoặc email đã đăng ký" required />
          <Field label="Mật khẩu" name="password" type="password" placeholder="••••••••" required />

          <button
            disabled={busy}
            className="button button-lime"
            style={{ marginTop: 8, padding: '12px 20px', fontSize: 14 }}
          >
            {busy ? 'Đang xác thực…' : 'Đăng nhập vào hệ thống'}
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
   DASHBOARD PAGE (WORKFORCE / COVERAGE POWERBI SYSTEM MATCHING IMAGE 2)
   ========================================================================= */

function Dashboard() {
  const overview = useApi<Row>('/admin/dashboard/overview');
  const stats = overview.data ?? {};
  const [dateRange, setDateRange] = useState('21d');
  const [chartMetric, setChartMetric] = useState<'supply' | 'sessions' | 'points'>('supply');
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const number = (value: unknown) => Number(value ?? 0).toLocaleString('vi-VN');

  const rawDaily = Array.isArray(stats.daily_activity) ? (stats.daily_activity as Row[]) : [];
  const demandMix = rawDaily.map((item) => {
    const day = String(item.day ?? '');
    return {
      day,
      dateLabel: day === String(stats.today ?? '') ? 'Hôm nay' : day.slice(5).replace('-', '/'),
      fullDate: day,
      supply: Number(item.accepted_items ?? 0),
      rejected: Number(item.rejected_items ?? 0),
      sessions: Number(item.sessions_count ?? 0),
      points: Number(item.points_issued ?? 0)
    };
  });
  const filteredDemandMix = dateRange === 'today'
    ? demandMix.filter((item) => item.day === String(stats.today ?? ''))
    : dateRange === '7d'
      ? demandMix.slice(-7)
      : dateRange === '30d'
        ? demandMix.slice(-30)
        : demandMix.slice(-21);

  const getMetricValue = (d: typeof demandMix[number]) => {
    if (chartMetric === 'sessions') return d.sessions;
    if (chartMetric === 'points') return d.points;
    return d.supply;
  };

  const maxVal = Math.max(...filteredDemandMix.map(getMetricValue), 1);
  const totalMetric = filteredDemandMix.reduce((acc, d) => acc + getMetricValue(d), 0);
  const hasActivity = filteredDemandMix.some((item) => item.supply > 0 || item.sessions > 0 || item.points > 0);
  const chartPoints = filteredDemandMix.map((item, index) => {
    const x = filteredDemandMix.length <= 1 ? 500 : 48 + (index * 904) / (filteredDemandMix.length - 1);
    const y = 178 - (getMetricValue(item) / maxVal) * 144;
    return { ...item, index, x, y, value: getMetricValue(item) };
  });
  const xLabelStep = Math.max(1, Math.ceil(filteredDemandMix.length / 6));
  const dataReady = Boolean(overview.data);
  const metricValue = (value: unknown) => value === null || value === undefined ? '—' : number(value);

  const handleExport = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Ngay,SoVoChaiChapNhan,SoPhien,DiemDaCap\n' +
      filteredDemandMix.map((d) => String(d.fullDate) + ',' + d.supply + ',' + d.sessions + ',' + d.points).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'BravoForest_Operations_' + dateRange + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const font = "var(--font-ui, 'Be Vietnam Pro', 'Inter', -apple-system, sans-serif)";

  return (
    <FadeContent trigger="mount" effect="fade" duration={0.4} ease="power2.out">
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          borderRadius: 20,
          padding: '24px 28px 32px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.04), 0 2px 8px -2px rgba(0, 0, 0, 0.02)',
          fontFamily: font
        }}
      >
        {/* =================================================================
            1. TOP BAR: BREADCRUMB + GLIDESELECT + EXPORT BUTTON
            ================================================================= */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
            <span style={{ fontWeight: 700, color: '#0f172a' }}>Hệ thống RVM</span>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ color: '#64748b', fontWeight: 500 }}>Giám sát hoạt động & Vận hành</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlideSelect
              options={[
                { value: '21d', label: '21 ngày qua', tag: 'Kỳ này' },
                { value: '7d', label: '7 ngày qua', tag: 'Tuần' },
                { value: '30d', label: '30 ngày qua', tag: 'Tháng' },
                { value: 'today', label: 'Hôm nay', tag: 'Trực tiếp' }
              ]}
              value={dateRange}
              onChange={(val) => setDateRange(val)}
              surfaceColor="#ffffff"
              highlightColor="#f1f5f9"
              textColor="#0f172a"
              accentColor="#16a34a"
              size="sm"
              radius={8}
              menuWidth={180}
            />

            <button
              type="button"
              onClick={handleExport}
              title="Xuất báo cáo CSV"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 15px',
                borderRadius: 8,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: 12.5,
                fontWeight: 650,
                cursor: 'pointer',
                fontFamily: font,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {(overview.loading || overview.error) && (
          <div
            role={overview.error ? 'alert' : 'status'}
            style={{
              padding: '10px 14px',
              marginBottom: 16,
              border: `1px solid ${overview.error ? '#fecaca' : '#dbeafe'}`,
              borderRadius: 10,
              background: overview.error ? '#fff7f7' : '#f8fbff',
              color: overview.error ? '#991b1b' : '#475569',
              fontSize: 13
            }}
          >
            {overview.error ? 'Không thể tải số liệu dashboard. Các chỉ số sẽ hiện lại khi kết nối được khôi phục.' : 'Đang đồng bộ số liệu từ database…'}
          </div>
        )}

        {!dataReady && !overview.loading && !overview.error && (
          <div
            role="status"
            style={{ padding: '10px 14px', marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 10, color: '#64748b', fontSize: 13 }}
          >
            Chưa có bản ghi tổng quan; các chỉ số sẽ hiển thị sau khi kết nối database.
          </div>
        )}

        <div
          aria-label="Các chỉ số tổng quan từ database"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))', gap: 12, marginBottom: 18 }}
        >
          {[
            {
              label: 'Khách hàng hoạt động',
              value: dataReady ? number(stats.active_customers) : '—',
              note: dataReady ? `${number(stats.total_users)} tài khoản trong hệ thống` : 'Chưa có số liệu'
            },
            {
              label: 'Máy RVM đang hoạt động',
              value: dataReady ? number(stats.active_machines) : '—',
              note: dataReady ? `${number(stats.total_machines)} máy · ${number(stats.total_locations)} địa điểm` : 'Chưa có số liệu'
            },
            {
              label: 'Mức đầy thùng trung bình',
              value: dataReady && stats.avg_bin_fill_percent !== null && stats.avg_bin_fill_percent !== undefined
                ? `${number(Math.round(Number(stats.avg_bin_fill_percent)))}%`
                : '—',
              note: dataReady ? `${number(stats.bins_reporting)} / ${number(stats.total_bins)} thùng có số đo` : 'Chưa có số liệu'
            },
            {
              label: 'Bao bì đạt chuẩn hôm nay',
              value: dataReady ? number(stats.accepted_items_today) : '—',
              note: dataReady
                ? `${number(stats.rejected_items_today)} bị từ chối · ${metricValue(stats.avg_bottles_per_session)} đạt/phiên · ${metricValue(stats.acceptance_rate)}${stats.acceptance_rate == null ? '' : '%'} đạt`
                : 'Chưa có số liệu'
            },
            {
              label: 'Điểm đã cấp hôm nay',
              value: dataReady ? number(stats.points_issued_today) : '—',
              note: dataReady ? `${number(stats.sessions_today)} phiên bắt đầu hôm nay` : 'Chưa có số liệu'
            },
            {
              label: 'Yêu cầu đổi tiền chờ duyệt',
              value: dataReady ? number(stats.pending_cashouts) : '—',
              note: 'Đang chờ quản trị viên xử lý'
            }
          ].map((metric, index) => (
            <div
              key={metric.label}
              style={{
                minWidth: 0,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '16px 17px 15px',
                boxShadow: '0 1px 2px rgba(15,23,42,0.03)'
              }}
            >
              <div style={{ fontSize: 12, lineHeight: 1.4, fontWeight: 650, color: '#64748b', minHeight: 34 }}>{metric.label}</div>
              <div style={{ marginTop: 7, fontSize: 27, lineHeight: 1.15, fontWeight: 760, letterSpacing: '-0.035em', color: index === 3 ? '#167a45' : '#102a20', fontVariantNumeric: 'tabular-nums' }}>
                {metric.value}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.45, color: '#64748b' }}>{metric.note}</div>
            </div>
          ))}
        </div>

        {/* =================================================================
            2. ACTIVITY CHART (INTERACTIVE METRIC SWITCHER)
            ================================================================= */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '24px 28px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: '#0f172a' }}>Hoạt động thu gom</h3>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b' }}>Số liệu ghi nhận từ phiên gửi và giao dịch điểm trong database.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '3px', borderRadius: 8 }}>
                {[
                  { key: 'supply', label: 'Vỏ đạt chuẩn' },
                  { key: 'sessions', label: 'Phiên gửi' },
                  { key: 'points', label: 'Điểm thưởng' }
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={chartMetric === m.key}
                    onClick={() => setChartMetric(m.key as typeof chartMetric)}
                    style={{
                      background: chartMetric === m.key ? '#ffffff' : 'transparent',
                      border: 'none',
                      boxShadow: chartMetric === m.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      color: chartMetric === m.key ? '#0f172a' : '#64748b',
                      fontWeight: 700,
                      fontSize: 11.5,
                      padding: '4px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: font
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2 }} />
                <span style={{ color: '#64748b' }}>Đã ghi nhận</span>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{number(totalMetric)}</strong>
              </div>
            </div>
          </div>

          {/* Database-backed line chart. The axes and series container stay visible when there are no rows. */}
          <div style={{ position: 'relative', width: '100%', height: 220 }}>
            <svg
              role="img"
              aria-label={`${chartMetric === 'supply' ? 'Bao bì đạt chuẩn' : chartMetric === 'sessions' ? 'Phiên gửi' : 'Điểm thưởng'} theo ngày`}
              viewBox="0 0 1000 220"
              preserveAspectRatio="none"
              style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}
            >
              {[34, 106, 178].map((y, index) => (
                <g key={y}>
                  <line x1="48" x2="988" y1={y} y2={y} stroke="#e7ece8" strokeWidth="1" />
                  <text x="0" y={y + 4} fill="#748078" fontSize="11" fontFamily={font}>
                    {number(Math.round((maxVal * (2 - index)) / 2))}
                  </text>
                </g>
              ))}
              {chartPoints.length > 0 && (
                <polyline
                  points={chartPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={hasActivity ? '#18834b' : '#a9b8af'}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {chartPoints.map((point) => (
                <g key={point.day}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hoveredBar === point.index ? 7 : hasActivity && point.value > 0 ? 4 : 2.5}
                    fill={hoveredBar === point.index ? '#0f5d36' : hasActivity && point.value > 0 ? '#18834b' : '#a9b8af'}
                    stroke="#ffffff"
                    strokeWidth={hoveredBar === point.index ? 2 : 1}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredBar(point.index)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <title>{`${point.fullDate}: ${number(point.value)}`}</title>
                  </circle>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="12"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredBar(point.index)}
                    onMouseLeave={() => setHoveredBar(null)}
                  />
                </g>
              ))}
            </svg>

            {hoveredBar !== null && chartPoints[hoveredBar] && (
              <div
                style={{
                  position: 'absolute',
                  left: `${(chartPoints[hoveredBar].x / 1000) * 100}%`,
                  top: `${(chartPoints[hoveredBar].y / 220) * 100}%`,
                  transform: 'translate(-50%, -115%)',
                  background: '#102a20',
                  color: '#ffffff',
                  padding: '7px 10px',
                  borderRadius: 7,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  zIndex: 2,
                  boxShadow: '0 4px 12px rgba(15,23,42,0.16)',
                  pointerEvents: 'none',
                  fontFamily: font
                }}
              >
                <div style={{ fontWeight: 700 }}>{chartPoints[hoveredBar].fullDate}</div>
                <div style={{ color: '#b7f0c8' }}>{number(chartPoints[hoveredBar].value)} {chartMetric === 'supply' ? 'bao bì' : chartMetric === 'sessions' ? 'phiên' : 'điểm'}</div>
              </div>
            )}

            {!hasActivity && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <span style={{ padding: '7px 11px', background: 'rgba(255,255,255,0.92)', color: '#64748b', fontSize: 12, borderRadius: 7 }}>
                  Chưa phát sinh dữ liệu trong khoảng thời gian này
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(filteredDemandMix.length, 1)}, minmax(0, 1fr))`, paddingLeft: '4.8%', paddingRight: '1.2%', marginTop: 7 }}>
            {filteredDemandMix.map((item, index) => {
              const isToday = item.day === String(stats.today ?? '');
              const showLabel = index === 0 || index === filteredDemandMix.length - 1 || index % xLabelStep === 0;
              return (
                <div key={item.day} style={{ textAlign: index === filteredDemandMix.length - 1 ? 'right' : index === 0 ? 'left' : 'center', fontSize: 10.5, fontWeight: isToday ? 750 : 500, color: isToday ? '#167a45' : '#748078', minHeight: 16 }}>
                  {showLabel ? item.dateLabel : ''}
                </div>
              );
            })}
          </div>

          {/* Footer Caption */}
          <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>Nguồn: bản ghi giao dịch và phiên gửi trong database.</span>
            <span>{dateRange === 'today' ? 'Hôm nay' : dateRange === '7d' ? '7 ngày gần nhất' : dateRange === '30d' ? '30 ngày gần nhất' : '21 ngày gần nhất'}</span>
          </div>
        </div>
      </div>
    </FadeContent>
  );
}
/* =========================================================================
   GENERIC DATA PAGE (USERS, MACHINES, LOCATIONS, ETC.)
   ========================================================================= */
function DataPage({ route }: { route: string }) {
  const spec: Record<string, { path: string; heads: string[]; keys: string[] }> = {
    users: {
      path: '/admin/users',
      heads: ['Thành viên', 'Email / Số điện thoại', 'Điểm thưởng', 'Trạng thái', 'Quản lý'],
      keys: ['full_name', 'email', 'balance', 'status']
    },
    machines: {
      path: '/admin/machines',
      heads: ['Mã thiết bị', 'Địa điểm lắp đặt', 'Trạng thái vận hành'],
      keys: ['machine_code', 'location_name', 'operational_status']
    },
    locations: {
      path: '/admin/locations',
      heads: ['Tên địa điểm', 'Địa chỉ cụ thể', 'Số lượng máy', 'Trạng thái'],
      keys: ['name', 'address', 'active_machines', 'is_active']
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
  };

  const cfg = spec[route];
  const identity = useApi<Row>('/auth/admin/me');
  const canManage = val(identity.data, 'role', 'role_name') === 'ADMIN';
  const currentUserId = String(val(identity.data, 'user_id', 'userId') || '');
  const [formOpen, setFormOpen] = useState(false);
  const partnerOptions = useApi<unknown>('/admin/partners?page=1&pageSize=100', route === 'vouchers' && formOpen);
  const categoryOptions = useApi<unknown>('/admin/voucher-categories', route === 'vouchers' && formOpen);
  const activePartners = rowsFrom<Row>(partnerOptions.data).filter((partner) => val(partner, 'status') === 'ACTIVE');
  const categories = rowsFrom<Row>(categoryOptions.data);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(1);
    setStatusFilter('');
  }, [route]);
  useEffect(() => setPage(1), [searchTerm, statusFilter]);
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (searchTerm) params.set('search', searchTerm);
  if (statusFilter) params.set(route === 'locations' ? 'active' : route === 'maintenance' ? 'type' : 'status', statusFilter);
  const path = `${cfg.path}?${params.toString()}`;
  const result = useApi<unknown>(path);
  const records = rowsFrom<Row>(result.data);
  const pageData = result.data && typeof result.data === 'object' ? result.data as Row : {};
  const total = Number(pageData.total ?? records.length);
  const totalPages = Number(pageData.totalPages ?? (total ? 1 : 0));
  const visible = records;
  const filters: Record<string, Array<[string, string]>> = {
    users: [['ACTIVE', 'Hoạt động'], ['LOCKED', 'Đã khóa'], ['DELETED', 'Đã xóa']],
    machines: [['ACTIVE', 'Đang hoạt động'], ['MAINTENANCE', 'Bảo trì'], ['DISABLED', 'Đã tắt'], ['DECOMMISSIONED', 'Ngừng hoạt động']],
    locations: [['1', 'Đang hoạt động'], ['0', 'Đã ngừng']],
    sessions: [['WAITING_LOGIN', 'Chờ đăng nhập'], ['DEPOSITING', 'Đang gửi'], ['PROCESSING', 'Đang xử lý'], ['COMPLETED', 'Hoàn tất'], ['CANCELLED', 'Đã hủy'], ['EXPIRED', 'Hết hạn']],
    vouchers: [['DRAFT', 'Bản nháp'], ['ACTIVE', 'Đang mở'], ['PAUSED', 'Tạm dừng'], ['ARCHIVED', 'Lưu trữ']],
    partners: [['ACTIVE', 'Đang hoạt động'], ['INACTIVE', 'Đã ngừng']],
    redemptions: [['PENDING', 'Đang xử lý'], ['ISSUED', 'Đã cấp'], ['USED', 'Đã sử dụng'], ['EXPIRED', 'Hết hạn'], ['FAILED', 'Thất bại'], ['CANCELLED', 'Đã hủy']],
    maintenance: [['INSPECTION', 'Kiểm tra'], ['CLEANING', 'Vệ sinh'], ['REPAIR', 'Sửa chữa'], ['PART_REPLACEMENT', 'Thay linh kiện'], ['FIRMWARE_UPDATE', 'Cập nhật firmware']]
  };
  const filterOptions = filters[route] ?? [];

  const [notice, setNotice] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openSwipeUserId, setOpenSwipeUserId] = useState<string | null>(null);

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
          ward: f.get('ward') || undefined,
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
      setOpenSwipeUserId(null);
      result.refresh();
    } catch (e) {
      setNotice({ msg: e instanceof Error ? e.message : 'Không thể cập nhật trạng thái.', type: 'error' });
    }
  };

  const createButton = canManage && ['machines', 'locations', 'vouchers', 'partners'].includes(route);

  return (
    <>
      <PageTitle
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
            <h3 style={{ fontFamily: "'Be Vietnam Pro', 'Inter', sans-serif", fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>
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
                  <Field label="Phường / Xã" name="ward" placeholder="Phường Láng Thượng" />
                  <Field label="Quận / Huyện" name="district" placeholder="Đống Đa" />
                  <Field label="Tỉnh / Thành phố" name="city" placeholder="Hà Nội" />
                  <Field label="Vĩ độ (Latitude)" name="latitude" type="number" step="any" placeholder="21.0285" />
                  <Field label="Kinh độ (Longitude)" name="longitude" type="number" step="any" placeholder="105.8542" />
                </>
              ) : route === 'vouchers' ? (
                <>
                  <label className="field"><span>Đối tác *</span><select name="partnerId" required defaultValue=""><option value="" disabled>Chọn đối tác đang hoạt động</option>{activePartners.map((partner) => <option key={val(partner, 'partner_id')} value={val(partner, 'partner_id')}>{val(partner, 'name')}</option>)}</select></label>
                  <label className="field"><span>Danh mục *</span><select name="categoryId" required defaultValue=""><option value="" disabled>Chọn danh mục</option>{categories.map((category) => <option key={val(category, 'category_id')} value={val(category, 'category_id')}>{val(category, 'name')}</option>)}</select></label>
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
              ) : (
                <>
                  <Field label="Mã đối tác *" name="code" placeholder="HIGHLANDS" required />
                  <Field label="Tên đối tác *" name="name" placeholder="Highlands Coffee" required />
                  <label className="field"><span>Loại đối tác *</span><select name="partnerType" required><option value="INTERNAL">Nội bộ</option><option value="EXTERNAL">Tích hợp bên ngoài</option></select></label>
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
          <h2>Danh sách ({total.toLocaleString('vi-VN')})</h2>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            className="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm trong toàn bộ danh sách…"
            aria-label="Tìm kiếm"
          />
          {filterOptions.length > 0 && (
            <GlideSelect
              options={[
                { value: '', label: 'Tất cả trạng thái', tag: 'Tất cả' },
                ...filterOptions.map(([val, lbl]) => ({ value: val, label: lbl, tag: 'Lọc' }))
              ]}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              surfaceColor="#ffffff"
              highlightColor="rgba(22, 121, 75, 0.08)"
              textColor="#26352c"
              accentColor="#16794b"
              size="md"
              radius={9}
              menuWidth={195}
              placeholder="Chọn trạng thái"
              ariaLabel="Lọc danh sách"
            />
          )}
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
                (() => {
                  const uId = String(val(r, 'user_id', 'id'));
                  const uRole = String(val(r, 'role', 'role_name')).toUpperCase();
                  const uStatus = String(val(r, 'status') || 'ACTIVE');
                  const isCurrentAdmin = uRole === 'ADMIN' && uId === currentUserId;

                  const userStatusOptions = [
                    ...(uStatus === 'DELETED' ? [{ value: 'DELETED', label: 'DELETED', tag: 'Đã xóa' }] : []),
                    { value: 'ACTIVE', label: 'ACTIVE', tag: 'Hoạt động' },
                    ...(!isCurrentAdmin ? [{ value: 'LOCKED', label: 'LOCKED', tag: 'Khóa' }] : []),
                    ...(uRole !== 'ADMIN' ? [{ value: 'DELETED', label: 'DELETED', tag: 'Xóa vĩnh viễn' }] : [])
                  ];

                  return (
                    <GlideSelect
                      key={`action-${uId}`}
                      value={uStatus}
                      options={userStatusOptions}
                      onChange={(newVal) => changeStatus(uId, newVal)}
                      surfaceColor="#ffffff"
                      highlightColor="#f1f5f9"
                      textColor="#0f172a"
                      accentColor="#16a34a"
                      size="sm"
                      radius={8}
                      menuWidth={175}
                      placement="bottom"
                      align="right"
                      ariaLabel={`Đổi trạng thái cho ${val(r, 'fullName', 'full_name', 'email')}`}
                    />
                  );
                })()
              ] : [])
            ])}
          />
        </ApiMessage>
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
  if (route === 'cashouts') return <AdminCashoutsPage />;
  if (['users', 'machines', 'locations', 'sessions', 'vouchers', 'partners', 'redemptions'].includes(route)) {
    return <DataPage route={route} />;
  }

  return (
    <div className="empty">
      <div className="empty-icon">🔍</div>
      <h2 style={{ fontFamily: "'Be Vietnam Pro', 'Inter', sans-serif", fontSize: 20, color: '#0f172a', margin: '0 0 8px' }}>
        Không tìm thấy mục quản trị này
      </h2>
      <p style={{ color: '#64748b', margin: '0 0 20px' }}>Đường dẫn không tồn tại trong sơ đồ điều hướng.</p>
      <Link href="/dashboard" className="button button-dark">
        Về trang Tổng quan
      </Link>
    </div>
  );
}
