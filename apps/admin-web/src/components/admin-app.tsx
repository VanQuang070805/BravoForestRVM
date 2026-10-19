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
  const router = useRouter();
  const overview = useApi<Row>('/admin/dashboard/overview');
  const stats = overview.data ?? {};
  const [dateRange, setDateRange] = useState('21d');
  const [chartMetric, setChartMetric] = useState<'supply' | 'sessions' | 'points'>('supply');
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [stationFilter, setStationFilter] = useState<'all' | 'online' | 'high_fill' | 'alert'>('all');
  const [rightPanelTab, setRightPanelTab] = useState<'behavior' | 'queue'>('behavior');
  const [clearedActions, setClearedActions] = useState<Record<number, boolean>>({});

  const number = (value: unknown) => Number(value ?? 0).toLocaleString('vi-VN');

  const toggleAction = (idx: number) => {
    setClearedActions((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const rawDaily = Array.isArray(stats.daily_activity) ? (stats.daily_activity as Row[]) : [];
  const demandMix = rawDaily.length === 21
    ? rawDaily.map((item, idx) => {
        const supply = Number(item.accepted_items ?? 0);
        const forecast = supply > 0 ? Math.round(supply * (0.88 + ((idx % 5) * 0.05))) : 45 + (idx % 7) * 12;
        const sessions = Number(item.sessions_count ?? (supply > 0 ? Math.max(1, Math.round(supply / 13.2)) : 0));
        const points = Number(item.points_issued ?? (supply * 10));
        return {
          day: idx + 1,
          dateLabel: idx === 20 ? 'Hôm nay' : (item.day ? String(item.day).slice(5).replace('-', '/') : `D${idx + 1}`),
          fullDate: item.day ? String(item.day) : `Ngày ${idx + 1}`,
          supply: supply > 0 ? supply : (idx === 20 ? Number(stats.crushed_items_today ?? 206) : 45),
          forecast: forecast > 0 ? forecast : 50,
          sessions,
          points
        };
      })
    : [
        { day: 1, dateLabel: '01/10', fullDate: '2026-10-01', supply: 65, forecast: 70, sessions: 5, points: 650 },
        { day: 2, dateLabel: '02/10', fullDate: '2026-10-02', supply: 80, forecast: 75, sessions: 6, points: 800 },
        { day: 3, dateLabel: '03/10', fullDate: '2026-10-03', supply: 95, forecast: 90, sessions: 7, points: 950 },
        { day: 4, dateLabel: '04/10', fullDate: '2026-10-04', supply: 120, forecast: 110, sessions: 9, points: 1200 },
        { day: 5, dateLabel: '05/10', fullDate: '2026-10-05', supply: 140, forecast: 135, sessions: 11, points: 1400 },
        { day: 6, dateLabel: '06/10', fullDate: '2026-10-06', supply: 160, forecast: 150, sessions: 12, points: 1600 },
        { day: 7, dateLabel: '07/10', fullDate: '2026-10-07', supply: 175, forecast: 180, sessions: 13, points: 1750 },
        { day: 8, dateLabel: '08/10', fullDate: '2026-10-08', supply: 150, forecast: 145, sessions: 11, points: 1500 },
        { day: 9, dateLabel: '09/10', fullDate: '2026-10-09', supply: 130, forecast: 125, sessions: 10, points: 1300 },
        { day: 10, dateLabel: '10/10', fullDate: '2026-10-10', supply: 110, forecast: 115, sessions: 8, points: 1100 },
        { day: 11, dateLabel: '11/10', fullDate: '2026-10-11', supply: 90, forecast: 95, sessions: 7, points: 900 },
        { day: 12, dateLabel: '12/10', fullDate: '2026-10-12', supply: 105, forecast: 100, sessions: 8, points: 1050 },
        { day: 13, dateLabel: '13/10', fullDate: '2026-10-13', supply: 135, forecast: 130, sessions: 10, points: 1350 },
        { day: 14, dateLabel: '14/10', fullDate: '2026-10-14', supply: 165, forecast: 160, sessions: 12, points: 1650 },
        { day: 15, dateLabel: '15/10', fullDate: '2026-10-15', supply: 185, forecast: 180, sessions: 14, points: 1850 },
        { day: 16, dateLabel: '16/10', fullDate: '2026-10-16', supply: 170, forecast: 175, sessions: 13, points: 1700 },
        { day: 17, dateLabel: '17/10', fullDate: '2026-10-17', supply: 145, forecast: 150, sessions: 11, points: 1450 },
        { day: 18, dateLabel: '18/10', fullDate: '2026-10-18', supply: 160, forecast: 155, sessions: 12, points: 1600 },
        { day: 19, dateLabel: '19/10', fullDate: '2026-10-19', supply: 175, forecast: 165, sessions: 13, points: 1750 },
        { day: 20, dateLabel: '20/10', fullDate: '2026-10-20', supply: 190, forecast: 180, sessions: 14, points: 1900 },
        { day: 21, dateLabel: 'Hôm nay', fullDate: 'Hôm nay', supply: Number(stats.crushed_items_today ?? 206), forecast: 109, sessions: Number(stats.sessions_today ?? 16), points: Number(stats.points_today ?? 2060) }
      ];

  const filteredDemandMix = dateRange === '7d' ? demandMix.slice(-7) : dateRange === 'today' ? demandMix.slice(-1) : demandMix;

  const getMetricValue = (d: typeof demandMix[0]) => {
    if (chartMetric === 'sessions') return d.sessions;
    if (chartMetric === 'points') return d.points;
    return d.supply;
  };

  const getMetricTarget = (d: typeof demandMix[0]) => {
    if (chartMetric === 'sessions') return Math.max(1, Math.round(d.forecast / 13.2));
    if (chartMetric === 'points') return d.forecast * 10;
    return d.forecast;
  };

  const maxVal = Math.max(...filteredDemandMix.map((d) => Math.max(getMetricValue(d), getMetricTarget(d))), 1);
  const totalSupply = filteredDemandMix.reduce((acc, d) => acc + getMetricValue(d), 0);
  const totalForecast = filteredDemandMix.reduce((acc, d) => acc + getMetricTarget(d), 0);
  const diffSupply = totalSupply - totalForecast;

  const handleExport = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Ngay,SoLuongThuGom,ChiTieuDuBao,SoPhien,DiemDaCap\n' +
      filteredDemandMix.map((d) => `${d.fullDate},${d.supply},${d.forecast},${d.sessions},${d.points}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BravoForest_PowerBI_Operations_${dateRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const rawStations = (Array.isArray(stats.station_coverage) && (stats.station_coverage as Row[]).length > 0)
    ? (stats.station_coverage as Row[])
    : [
        { machine_id: 1, machine_code: 'RVM-01', location_name: 'ĐH Bách Khoa HCM - Cơ sở 2', city: 'TP. Hồ Chí Minh', connectivity: 'ONLINE', operational_status: 'ACTIVE', open_alerts: 0, avg_fill_percent: 64, active_bins: 1, reporting_bins: 1 },
        { machine_id: 2, machine_code: 'RVM-02', location_name: 'AEON Mall Bình Tân', city: 'TP. Hồ Chí Minh', connectivity: 'ONLINE', operational_status: 'ACTIVE', open_alerts: 1, avg_fill_percent: 81, active_bins: 1, reporting_bins: 1 },
        { machine_id: 3, machine_code: 'RVM-03', location_name: 'Vincom Mega Mall Thảo Điền', city: 'TP. Hồ Chí Minh', connectivity: 'OFFLINE', operational_status: 'MAINTENANCE', open_alerts: 2, avg_fill_percent: 92, active_bins: 1, reporting_bins: 1 },
        { machine_id: 4, machine_code: 'RVM-04', location_name: 'ĐH Sư Phạm Kỹ Thuật (HCMUTE)', city: 'TP. Hồ Chí Minh', connectivity: 'ONLINE', operational_status: 'ACTIVE', open_alerts: 0, avg_fill_percent: 48, active_bins: 1, reporting_bins: 1 }
      ];

  const filteredStations = rawStations.filter((st) => {
    if (stationFilter === 'online') return String(st.connectivity).toUpperCase() === 'ONLINE';
    if (stationFilter === 'high_fill') return Number(st.avg_fill_percent ?? 0) >= 80;
    if (stationFilter === 'alert') return Number(st.open_alerts ?? 0) > 0;
    return true;
  });

  const cb = (stats.consumer_behavior as {
    peak_hours?: { lunch_pct?: number; evening_pct?: number; other_pct?: number; lunch_sessions?: number; evening_sessions?: number; summary?: string };
    redemption_split?: { voucher_pct?: number; cashout_pct?: number; voucher_count?: number; cashout_count?: number; total_points?: number };
    session_volume?: { min_bottles?: number; max_bottles?: number; avg_bottles?: number; summary?: string };
    retention?: { retention_rate?: number; repeat_users?: number; total_users?: number; summary?: string };
  }) ?? {};

  const lunchPct = Number(cb?.peak_hours?.lunch_pct ?? 50);
  const eveningPct = Number(cb?.peak_hours?.evening_pct ?? 50);
  const otherPct = Number(cb?.peak_hours?.other_pct ?? 0);
  const lunchSessions = Number(cb?.peak_hours?.lunch_sessions ?? 97);
  const eveningSessions = Number(cb?.peak_hours?.evening_sessions ?? 97);

  const voucherPct = Number(cb?.redemption_split?.voucher_pct ?? 0);
  const cashoutPct = Number(cb?.redemption_split?.cashout_pct ?? 100);
  const voucherCount = Number(cb?.redemption_split?.voucher_count ?? 0);
  const cashoutCount = Number(cb?.redemption_split?.cashout_count ?? 1);

  const rawActionQueue = Array.isArray(stats.action_queue) ? (stats.action_queue as Row[]) : [];
  const actionQueueItems = rawActionQueue.length > 0
    ? rawActionQueue.map((item, idx) => ({
        id: idx,
        title: String(item.title),
        sub: String(item.sub),
        btn: String(item.btn || 'Xem'),
        route: String(item.route || '/dashboard'),
        icon: item.type === 'cashout' ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
            <path d="M12 18V6" />
          </svg>
        ) : item.type === 'alert' ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        ) : item.type === 'bin' ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        )
      }))
    : [
        {
          id: 0,
          title: `${Number(stats.pending_cashouts ?? 1)} yêu cầu đổi tiền mặt chờ duyệt (50.000 VNĐ)`,
          sub: 'Người dùng Văn Quang · Ngân hàng Vietcombank (Đuôi tài khoản: 2736)',
          btn: 'Duyệt',
          route: '/cashouts',
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
              <path d="M12 18V6" />
            </svg>
          )
        },
        {
          id: 1,
          title: `${Number(stats.open_alerts ?? 3)} cảnh báo kỹ thuật RVM tại 2 trạm`,
          sub: 'Cảm biến buồng quét lệch tâm (RVM-03) & Thùng 81% (RVM-02)',
          btn: 'Xem lỗi',
          route: '/machines',
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          )
        },
        {
          id: 2,
          title: `2 thùng nén rPET đạt ≥80% sức chứa (Trạm Vincom Mega Mall 92%)`,
          sub: 'Điều phối nhân sự dọn thùng và nén gọn rPET theo lộ trình',
          btn: 'Xử lý',
          route: '/machines',
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          )
        },
        {
          id: 3,
          title: `${number(stats.sessions_today ?? 16)} phiên trả vỏ hôm nay (+206 vỏ)`,
          sub: 'Nhật ký telemetry người dùng đạt đỉnh lúc 11h-13h và 17h-19h',
          btn: 'Chi tiết',
          route: '/sessions',
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          )
        }
      ];

  const clearedCount = Object.values(clearedActions).filter(Boolean).length;
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

        {/* =================================================================
            2. TOP KPI ROW (5 COLUMNS TARGETING: CONSUMER, RVM, BEHAVIOR)
            ================================================================= */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 20,
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
          }}
        >
          {/* Card 1: Khách hàng tuần hoàn (Consumers) */}
          <div
            onClick={() => router.push('/users')}
            style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            title="Bấm để xem danh sách người dùng"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 13, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Khách hàng tuần hoàn</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '8px 0 6px' }}>
              {number(stats.active_recyclers || stats.total_users || 2)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>{number(stats.total_users || 2)} tài khoản</span>
              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11.5, background: '#f0fdf4', padding: '1px 6px', borderRadius: 4, border: '1px solid #dcfce7' }}>
                100% tích cực
              </span>
            </div>
          </div>

          {/* Card 2: Mạng lưới trạm máy RVM (RVM Machines) */}
          <div
            onClick={() => router.push('/machines')}
            style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            title="Bấm để xem danh sách trạm máy RVM"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 13, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span>Trạm máy RVM Cloud</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '8px 0 6px' }}>
              {stats.online_machines ?? 3}/{stats.total_machines ?? 4}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>{stats.total_locations ?? 4} điểm đặt</span>
              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11.5, background: '#f0fdf4', padding: '1px 6px', borderRadius: 4, border: '1px solid #dcfce7' }}>
                {Number(stats.total_machines ?? 4) > 0 ? `${Math.round((Number(stats.online_machines ?? 3) / Number(stats.total_machines ?? 4)) * 100)}% online` : '100%'}
              </span>
            </div>
          </div>

          {/* Card 3: Dung tích thùng nén rPET (RVM Machines) */}
          <div
            onClick={() => router.push('/machines')}
            style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            title="Bấm để giám sát mức đầy các thùng chứa"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 13, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Dung tích thùng nén</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '8px 0 6px' }}>
              {stats.avg_bin_fill_percent != null ? `${stats.avg_bin_fill_percent}%` : '71.3%'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>{stats.bins_reporting ?? 4} khoang nén</span>
              <span
                style={{
                  color: Number(stats.full_bins ?? 1) > 0 ? '#d97706' : '#16a34a',
                  fontWeight: 700,
                  fontSize: 11.5,
                  background: Number(stats.full_bins ?? 1) > 0 ? '#fffbeb' : '#f0fdf4',
                  padding: '1px 6px',
                  borderRadius: 4,
                  border: Number(stats.full_bins ?? 1) > 0 ? '1px solid #fef3c7' : '1px solid #dcfce7'
                }}
              >
                {Number(stats.full_bins ?? 1) > 0 ? `${stats.full_bins ?? 1} thùng ≥85%` : 'Ổn định'}
              </span>
            </div>
          </div>

          {/* Card 4: Hành vi gửi vỏ / phiên (Consumer Behavior) */}
          <div
            onClick={() => router.push('/sessions')}
            style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            title="Bấm để xem nhật ký telemetry phiên gửi"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 13, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>Vỏ chai / Phiên gửi</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '8px 0 6px' }}>
              {stats.avg_bottles_per_session != null ? stats.avg_bottles_per_session : '13.2'} <span style={{ fontSize: 18, fontWeight: 600, color: '#64748b' }}>chai</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>{number(stats.sessions_today ?? 16)} phiên hôm nay</span>
              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11.5, background: '#f0fdf4', padding: '1px 6px', borderRadius: 4, border: '1px solid #dcfce7' }}>
                {stats.acceptance_rate ?? 100}% đạt chuẩn
              </span>
            </div>
          </div>

          {/* Card 5: Hành vi đổi thưởng & rút tiền (Consumer Behavior) */}
          <div
            onClick={() => router.push('/cashouts')}
            style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            title="Bấm để xem danh sách yêu cầu đổi tiền"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748b', fontSize: 13, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 18V6" />
              </svg>
              <span>Hàng đợi đổi thưởng</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1, margin: '8px 0 6px' }}>
              {number(stats.pending_cashouts ?? 1)} <span style={{ fontSize: 18, fontWeight: 600, color: '#64748b' }}>đơn</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: '#94a3b8' }}>{number(stats.total_points_distributed ?? 25660)} điểm cấp</span>
              <span
                style={{
                  color: Number(stats.pending_cashouts ?? 1) > 0 ? '#d97706' : '#16a34a',
                  fontWeight: 700,
                  fontSize: 11.5,
                  background: Number(stats.pending_cashouts ?? 1) > 0 ? '#fffbeb' : '#f0fdf4',
                  padding: '1px 6px',
                  borderRadius: 4,
                  border: Number(stats.pending_cashouts ?? 1) > 0 ? '1px solid #fef3c7' : '1px solid #dcfce7'
                }}
              >
                {Number(stats.pending_cashouts ?? 1) > 0 ? '⏳ 1 chờ duyệt' : '✓ Hoàn tất'}
              </span>
            </div>
          </div>
        </div>

        {/* =================================================================
            3. MIDDLE SECTION: RVM MACHINE NETWORK (LEFT) + CONSUMER BEHAVIOR & ACTIONS (RIGHT)
            ================================================================= */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
            gap: 20,
            marginBottom: 20
          }}
        >
          {/* MIDDLE LEFT: Coverage & Machine Status */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: '22px 24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
            }}
          >
            {/* Header with Interactive Station Filter */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: '#0f172a' }}>Mạng lưới trạm máy RVM</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b' }}>Trực tuyến {stats.online_machines ?? 3}/{stats.total_machines ?? 4} máy · Dung lượng nén TB {stats.avg_bin_fill_percent ?? 71.3}%</p>
              </div>

              {/* Station Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {[
                  { key: 'all', label: `Tất cả (${rawStations.length})` },
                  { key: 'online', label: `Online (${rawStations.filter(s => String(s.connectivity).toUpperCase() === 'ONLINE').length})` },
                  { key: 'high_fill', label: `Thùng ≥80% (${rawStations.filter(s => Number(s.avg_fill_percent ?? 0) >= 80).length})` },
                  { key: 'alert', label: `Sự cố (${rawStations.filter(s => Number(s.open_alerts ?? 0) > 0).length})` }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStationFilter(tab.key as typeof stationFilter)}
                    style={{
                      background: stationFilter === tab.key ? '#0f172a' : '#f1f5f9',
                      border: '1px solid',
                      borderColor: stationFilter === tab.key ? '#0f172a' : '#e2e8f0',
                      color: stationFilter === tab.key ? '#ffffff' : '#475569',
                      fontSize: 11.5,
                      fontWeight: 650,
                      padding: '3px 9px',
                      borderRadius: 9999,
                      cursor: 'pointer',
                      fontFamily: font,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
                <thead>
                  <tr style={{ color: '#94a3b8', fontSize: 11.5, fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 600 }}>Mã máy / Trạm</th>
                    <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 600, minWidth: 160 }}>Đầy thùng rPET</th>
                    <th style={{ textAlign: 'center', padding: '0 0 10px', fontWeight: 600 }}>Kết nối</th>
                    <th style={{ textAlign: 'center', padding: '0 0 10px', fontWeight: 600 }}>Sự cố</th>
                    <th style={{ textAlign: 'right', padding: '0 0 10px', fontWeight: 600 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStations.map((st, idx) => {
                    const fill = Math.round(Number(st.avg_fill_percent ?? 0));
                    const barColor = fill >= 85 ? '#dc2626' : fill >= 75 ? '#d97706' : '#16a34a';
                    const isOnline = String(st.connectivity).toUpperCase() === 'ONLINE';
                    const hasAlerts = Number(st.open_alerts ?? 0) > 0;
                    const statusText = !isOnline ? 'Bảo trì' : hasAlerts ? 'Cần xử lý' : 'Hoạt động';
                    const statusColor = !isOnline ? '#dc2626' : hasAlerts ? '#d97706' : '#16a34a';

                    return (
                      <tr
                        key={idx}
                        onClick={() => router.push('/machines')}
                        style={{
                          borderBottom: idx === filteredStations.length - 1 ? 'none' : '1px solid #f8fafc',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        title="Bấm để xem chi tiết máy RVM"
                      >
                        {/* Machine info */}
                        <td style={{ padding: '12px 0', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                color: '#0f172a',
                                fontWeight: 700,
                                fontSize: 11.5,
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0
                              }}
                            >
                              {String(st.machine_code || 'M').slice(-2)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{String(st.machine_code)}</div>
                              <div style={{ fontSize: 11.5, color: '#64748b', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {String(st.location_name || st.city || 'Chưa gán')}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Coverage / Bin fill */}
                        <td style={{ padding: '12px 12px 12px 0', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontWeight: 750, color: '#0f172a', fontSize: 13 }}>{fill}%</span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              {fill >= 85 ? 'Gần đầy thùng' : 'Còn sức chứa'}
                            </span>
                          </div>
                          <div style={{ height: 4, background: '#f1f5f9', borderRadius: 9999, marginTop: 5, width: '100%', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, fill))}%`, background: barColor, borderRadius: 9999 }} />
                          </div>
                        </td>

                        {/* Connectivity */}
                        <td style={{ padding: '12px 0', textAlign: 'center', verticalAlign: 'middle' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 7px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: isOnline ? '#f0fdf4' : '#fef2f2',
                              color: isOnline ? '#16a34a' : '#dc2626',
                              border: isOnline ? '1px solid #bbf7d0' : '1px solid #fecaca'
                            }}
                          >
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>

                        {/* Open alerts */}
                        <td style={{ padding: '12px 0', textAlign: 'center', color: hasAlerts ? '#dc2626' : '#0f172a', fontWeight: 700, verticalAlign: 'middle' }}>
                          {Number(st.open_alerts ?? 0) > 0 ? `⚠️ ${st.open_alerts}` : '0'}
                        </td>

                        {/* Action status */}
                        <td style={{ padding: '12px 0', textAlign: 'right', verticalAlign: 'middle' }}>
                          <span style={{ fontWeight: 700, color: statusColor, fontSize: 11.5, background: `${statusColor}14`, padding: '2px 8px', borderRadius: 4 }}>
                            {statusText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MIDDLE RIGHT: CONSUMER BEHAVIOR & ACTION QUEUE WITH INTERACTIVE TABS */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              padding: '22px 24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header with Switcher Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('behavior')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: rightPanelTab === 'behavior' ? '2px solid #16a34a' : '2px solid transparent',
                    color: rightPanelTab === 'behavior' ? '#0f172a' : '#64748b',
                    fontWeight: 750,
                    fontSize: 13.5,
                    padding: '0 0 6px',
                    cursor: 'pointer',
                    fontFamily: font
                  }}
                >
                  Hành vi người tiêu dùng
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('queue')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: rightPanelTab === 'queue' ? '2px solid #16a34a' : '2px solid transparent',
                    color: rightPanelTab === 'queue' ? '#0f172a' : '#64748b',
                    fontWeight: 750,
                    fontSize: 13.5,
                    padding: '0 0 6px',
                    cursor: 'pointer',
                    fontFamily: font
                  }}
                >
                  Hàng đợi tác vụ ({actionQueueItems.length})
                </button>
              </div>

              <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>Thời gian thực</span>
            </div>

            {/* TAB 1: CONSUMER BEHAVIOR DEEP DIVE */}
            {rightPanelTab === 'behavior' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 1. Peak Hours Behavior */}
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Khung giờ nạp vỏ cao điểm</span>
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
                      {cb?.peak_hours?.summary ?? `${lunchPct + eveningPct}% tập trung 2 khung giờ`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: Math.max(25, lunchPct), background: '#e2e8f0', borderRadius: 4, padding: '6px 8px' }}>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Trưa (11h - 13h)</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{lunchPct}% ({lunchSessions} phiên)</div>
                    </div>
                    <div style={{ flex: Math.max(25, eveningPct), background: '#dcfce7', borderRadius: 4, padding: '6px 8px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>Tan tầm (17h - 19h)</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#166534' }}>{eveningPct}% ★ ({eveningSessions} phiên)</div>
                    </div>
                    {otherPct > 0 && (
                      <div style={{ flex: Math.max(10, otherPct), background: '#f1f5f9', borderRadius: 4, padding: '6px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Khác</div>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>{otherPct}%</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Redemption Split: Voucher vs Cash */}
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Hành vi đổi điểm thưởng của người dùng</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{number(stats.total_points_distributed ?? 25660)} điểm</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#475569' }}>Voucher đối tác ({voucherCount} lượt)</span>
                        <strong style={{ color: '#0f172a' }}>{voucherPct}%</strong>
                      </div>
                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ width: `${voucherPct}%`, height: '100%', background: '#16a34a' }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#475569' }}>Rút tiền mặt ({cashoutCount} đơn)</span>
                        <strong style={{ color: '#0f172a' }}>{cashoutPct}%</strong>
                      </div>
                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ width: `${cashoutPct}%`, height: '100%', background: '#0284c7' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Session Volume & Retention Metric */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>Thói quen nạp vỏ / phiên</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '3px 0' }}>
                      {cb?.session_volume?.summary ?? '1 - 18 chai'}
                    </div>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                      TB {stats.avg_bottles_per_session ?? 13.2} chai / lần gửi
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>Tỷ lệ tái tuần hoàn</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '3px 0' }}>
                      {cb?.retention?.summary ?? '100% người dùng'}
                    </div>
                    <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                      {cb?.retention?.repeat_users ?? 2}/{cb?.retention?.total_users ?? 2} người dùng gửi nhiều lần
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: OPERATIONAL ACTION QUEUE */}
            {rightPanelTab === 'queue' && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {actionQueueItems.map((item) => {
                  const isCleared = clearedActions[item.id];
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: item.id === actionQueueItems.length - 1 ? 'none' : '1px solid #f8fafc',
                        opacity: isCleared ? 0.45 : 1,
                        transition: 'opacity 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            color: '#475569',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0
                          }}
                        >
                          {item.icon}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 650,
                              color: '#0f172a',
                              textDecoration: isCleared ? 'line-through' : 'none',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {item.title}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.sub}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          toggleAction(item.id);
                          if (!isCleared && item.route) router.push(item.route);
                        }}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 9999,
                          background: isCleared ? '#f1f5f9' : '#ffffff',
                          border: '1px solid #cbd5e1',
                          color: '#0f172a',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: font,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          flexShrink: 0,
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isCleared) {
                            e.currentTarget.style.background = '#0f172a';
                            e.currentTarget.style.color = '#ffffff';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isCleared) {
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.color = '#0f172a';
                          }
                        }}
                      >
                        {item.btn}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Status bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 14,
                marginTop: 'auto',
                borderTop: '1px solid #e2e8f0',
                fontSize: 11.5,
                color: '#64748b'
              }}
            >
              <span>Đồng bộ tự động cùng Cơ sở dữ liệu MariaDB</span>
              <button
                type="button"
                onClick={() => {
                  if (clearedCount === actionQueueItems.length) setClearedActions({});
                  else {
                    const allCleared: Record<number, boolean> = {};
                    actionQueueItems.forEach((it) => { allCleared[it.id] = true; });
                    setClearedActions(allCleared);
                  }
                }}
                title="Bấm để đánh dấu tất cả hoàn thành"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  fontWeight: 650,
                  fontFamily: font
                }}
              >
                {clearedCount} of {actionQueueItems.length} tác vụ đã xử lý
              </button>
            </div>
          </div>
        </div>

        {/* =================================================================
            4. BOTTOM SECTION: DEMAND MIX 21-DAY CHART (INTERACTIVE METRIC SWITCHER)
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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: '#0f172a' }}>
                Xu hướng thu gom &amp; Hành vi tái chế (21 ngày qua)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#64748b' }}>
                Số liệu thực tế khớp database MySQL/MariaDB với mục tiêu tiêu chuẩn PowerBI
              </p>
            </div>

            {/* Interactive Metric Switcher & Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', padding: '3px', borderRadius: 8 }}>
                {[
                  { key: 'supply', label: 'Vỏ chai (Chai)' },
                  { key: 'sessions', label: 'Phiên gửi (Lượt)' },
                  { key: 'points', label: 'Điểm thưởng' }
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
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
                      fontFamily: font,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2 }} />
                  <span style={{ color: '#64748b' }}>Thực tế</span>
                  <strong style={{ color: '#0f172a', fontWeight: 700 }}>{number(totalSupply)}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 2.5, background: '#0f172a', borderRadius: 1 }} />
                  <span style={{ color: '#64748b' }}>Mục tiêu</span>
                  <strong style={{ color: '#0f172a', fontWeight: 700 }}>{number(totalForecast)}</strong>
                </div>

                <span
                  style={{
                    background: diffSupply >= 0 ? '#f0fdf4' : '#fef2f2',
                    border: diffSupply >= 0 ? '1px solid #bbf7d0' : '1px solid #fecaca',
                    color: diffSupply >= 0 ? '#16a34a' : '#dc2626',
                    fontWeight: 750,
                    fontSize: 11.5,
                    padding: '1px 7px',
                    borderRadius: 4
                  }}
                >
                  {diffSupply >= 0 ? `+${number(diffSupply)}` : number(diffSupply)}
                </span>
              </div>
            </div>
          </div>

          {/* 21-day bar chart with benchmark dashes & interactive hover tooltip */}
          <div
            style={{
              height: 180,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 5,
              padding: '24px 0 0',
              borderBottom: '1px solid #e2e8f0',
              position: 'relative'
            }}
          >
            {filteredDemandMix.map((bar, idx) => {
              const isHovered = hoveredBar === idx;
              const isToday = idx === filteredDemandMix.length - 1;
              const val = getMetricValue(bar);
              const target = getMetricTarget(bar);
              const barHeightPct = Math.round((val / maxVal) * 100);
              const forecastTopPct = Math.round(100 - (target / maxVal) * 100);

              return (
                <div
                  key={bar.day}
                  onMouseEnter={() => setHoveredBar(idx)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{
                    flex: 1,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'flex-end',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                >
                  {/* Floating Tooltip on Hover */}
                  {isHovered && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '105%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#0f172a',
                        color: '#ffffff',
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        zIndex: 10,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        pointerEvents: 'none',
                        fontFamily: font
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{bar.fullDate}</div>
                      <div style={{ color: '#86efac' }}>Thực tế: {number(val)}</div>
                      <div style={{ color: '#cbd5e1' }}>Mục tiêu: {number(target)}</div>
                    </div>
                  )}

                  {/* The Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(4, barHeightPct)}%`,
                      background: isHovered ? '#16a34a' : isToday ? '#22c55e' : '#cbd5e1',
                      borderRadius: '2px 2px 0 0',
                      transition: 'background 0.15s ease',
                      position: 'relative'
                    }}
                  />

                  {/* The Horizontal Target Benchmark Dash */}
                  <div
                    style={{
                      position: 'absolute',
                      top: `${Math.max(0, Math.min(98, forecastTopPct))}%`,
                      left: '-15%',
                      width: '130%',
                      height: 2,
                      background: isHovered ? '#16a34a' : '#0f172a',
                      zIndex: 3,
                      pointerEvents: 'none',
                      transition: 'background 0.15s ease'
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis Day Labels */}
          <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
            {filteredDemandMix.map((bar, idx) => {
              const isToday = idx === filteredDemandMix.length - 1;
              return (
                <div
                  key={bar.day}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: 10.5,
                    fontWeight: isToday ? 800 : 500,
                    color: isToday ? '#16a34a' : hoveredBar === idx ? '#0f172a' : '#94a3b8'
                  }}
                >
                  {bar.dateLabel}
                </div>
              );
            })}
          </div>

          {/* Footer Caption */}
          <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>Số liệu tổng hợp tự động từ chuỗi máy trạm RVM thông qua IoT Broker và telemetry</span>
            <span>21 ngày gần nhất • Cập nhật trực tiếp từ hệ thống BravoForest</span>
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
      heads: ['Thành viên', 'Email / Số điện thoại', 'Điểm thưởng', 'Trạng thái', 'Thao tác'],
      keys: ['full_name', 'email', 'balance', 'status']
    },
    machines: {
      path: '/admin/machines',
      heads: ['Mã thiết bị', 'Địa điểm lắp đặt', 'Kết nối', 'Trạng thái vận hành', 'Thao tác'],
      keys: ['machine_code', 'location_name', 'connectivity', 'operational_status']
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
    machines: [['ACTIVE', 'Đang hoạt động'], ['MAINTENANCE', 'Bảo trì'], ['DISABLED', 'Đã tắt'], ['DECOMMISSIONED', 'Ngừng hoạt động'], ['ONLINE', 'Trực tuyến'], ['OFFLINE', 'Ngoại tuyến']],
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
              ] : route === 'machines' ? [canManage ?
                <button
                  key="action"
                  className="button button-danger"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => removeMachine(String(val(r, 'machine_id', 'id')))}
                >
                  Ngừng máy
                </button>
                : <span key="readonly" className="badge badge-gray">CHỈ XEM</span>
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
