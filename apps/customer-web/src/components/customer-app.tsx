'use client';
import { useEffect, useState, useMemo, useRef, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import gsap from 'gsap';
import { Button, Card, Pill } from '@bravoforest/ui';
import { apiGet, apiPatch, apiPost, clearAccessToken, markSignedOut, ApiError } from '../lib/api';
import { useApi, rowsFrom } from '../lib/use-api';
import { RvmMap } from './rvm-map';

type Row = Record<string, any>;

const navLinks = [
  { label: 'Home', path: '' },
  { label: 'Dashboard', path: 'dashboard' },
  { label: 'RVM Map', path: 'machines' },
  { label: 'Rewards', path: 'rewards' },
  { label: 'Wallet', path: 'wallet' },
  { label: 'History', path: 'history' }
];

const val = (o: Row, ...keys: string[]) => {
  for (const k of keys) {
    if (o?.[k] !== undefined && o[k] !== null) return o[k];
  }
  return '';
};

const fmtDate = (v: any) => v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function ApiMessage({ loading, error, empty, children }: { loading: boolean; error: string; empty?: boolean; children: ReactNode }) {
  if (loading) return <div className="tomorro-card" role="status" style={{ padding: 32, textAlign: 'center', color: '#9db4a6' }}>Đang tải dữ liệu…</div>;
  if (error) return <div className="tomorro-card" role="alert" style={{ padding: 24, borderColor: '#f87171', color: '#fca5a5' }}><strong>Unable to fetch data</strong><p style={{ margin: '6px 0 0', color: '#f87171' }}>{error}</p></div>;
  if (empty) return <div style={{ border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 16, padding: 36, textAlign: 'center', color: '#8aa192' }}>Chưa có dữ liệu trong mục này.</div>;
  return <>{children}</>;
}

/* =========================================================================
   UNIFIED HEADER BAR (EXACT TOMORRO STYLE - IDENTICAL ACROSS ALL PAGES)
   ========================================================================= */

function UnifiedNavbar({
  user,
  balance,
  logout
}: {
  user?: Row;
  balance?: number;
  logout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const currentPath = pathname?.replace(/^\//, '') || '';

  const userInitials = String(val(user ?? {}, 'fullName', 'full_name') || 'BF')
    .split(' ')
    .slice(-1)[0]
    .slice(0, 2)
    .toUpperCase();

  const isLinkActive = (path: string) => {
    if (path === '') return currentPath === '' || currentPath === 'home';
    return currentPath === path || currentPath.startsWith(path + '/');
  };

  return (
    <header className="tomorro-navbar">
      <div className="tomorro-nav-container">
        {/* Brand Logo */}
        <Link href="/" className="tomorro-logo">
          <span style={{ color: 'var(--tomorro-fluo-green)', fontSize: 28, marginRight: 2 }}>✳</span> bravoforest
        </Link>

        {/* Desktop Nav Links */}
        <nav className="tomorro-nav-links">
          {navLinks.map(({ label, path }) => (
            <Link
              key={path}
              href={`/${path}`}
              className={`tomorro-nav-link ${isLinkActive(path) ? 'active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop Right Actions */}
        <div className="tomorro-nav-actions">
          {user ? (
            <>
              <Link href="/wallet" className="tomorro-nav-balance" title="View Green Balance">
                <span>✳</span> {(balance ?? 0).toLocaleString()} pts
              </Link>
              <div className="tomorro-nav-user">
                <Link href="/profile" className="tomorro-user-avatar" title="Account Profile">
                  {userInitials}
                </Link>
                <button
                  onClick={logout}
                  className="text-button"
                  style={{ color: '#8da295', fontSize: 12, padding: '0 6px', background: 'none', border: 0, cursor: 'pointer' }}
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-tomorro-dark-pill" style={{ padding: '8px 18px', fontSize: 13.5 }}>
                Sign In
              </Link>
              <Link href="/register" className="btn-tomorro-lime" style={{ padding: '9px 20px', fontSize: 13.5 }}>
                Get Started ↗
              </Link>
            </>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            className="tomorro-mobile-toggle"
            aria-label="Menu"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileOpen && (
        <div className="tomorro-mobile-drawer open">
          {navLinks.map(({ label, path }) => (
            <Link
              key={path}
              href={`/${path}`}
              onClick={() => setMobileOpen(false)}
              className={`tomorro-nav-link ${isLinkActive(path) ? 'active' : ''}`}
              style={{ padding: '10px 14px' }}
            >
              {label}
            </Link>
          ))}
          <div style={{ paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 10 }}>
            {user ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link href="/profile" onClick={() => setMobileOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="tomorro-user-avatar">{userInitials}</span>
                  <strong style={{ color: '#ffffff', fontSize: 13 }}>{val(user, 'fullName', 'full_name')}</strong>
                </Link>
                <button onClick={() => { setMobileOpen(false); logout(); }} style={{ background: 'none', border: 0, color: '#8da295' }}>Sign Out</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Link href="/login" onClick={() => setMobileOpen(false)} className="btn-tomorro-dark-pill" style={{ textAlign: 'center', justifyContent: 'center' }}>
                  Sign In
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)} className="btn-tomorro-lime" style={{ textAlign: 'center', justifyContent: 'center' }}>
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/* =========================================================================
   UNIFIED FOOTER BAR (EXACT TOMORRO STYLE - IDENTICAL ACROSS ALL PAGES)
   ========================================================================= */

function UnifiedFooter() {
  return (
    <footer className="tomorro-footer">
      <div className="tomorro-footer-inner">
        <div className="tomorro-footer-grid">
          {/* Brand Info */}
          <div className="tomorro-footer-col">
            <div className="tomorro-logo" style={{ marginBottom: 16 }}>
              <span style={{ color: 'var(--tomorro-fluo-green)', fontSize: 28, marginRight: 2 }}>✳</span> bravoforest
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 320, color: '#8da194' }}>
              BravoForest connects customers with reverse vending machines and a points wallet for eligible returns.
            </p>
          </div>

          {/* Links Column 1 */}
          <div className="tomorro-footer-col">
            <h4>EXPLORE</h4>
            <ul>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/dashboard">Personal Dashboard</Link></li>
              <li><Link href="/wallet">Green Points Wallet</Link></li>
              <li><Link href="/rewards">Rewards & Vouchers</Link></li>
              <li><Link href="/history">Deposit History</Link></li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div className="tomorro-footer-col">
            <h4>RVM INFRASTRUCTURE</h4>
            <ul>
              <li><Link href="/machines">Interactive Kiosk Map</Link></li>
              <li><Link href="/machine-login">Link a machine session</Link></li>
            </ul>
          </div>

          {/* Links Column 3 */}
          <div className="tomorro-footer-col">
            <h4>PARTNERS & SUPPORT</h4>
            <ul>
              <li><Link href="/machines">Return locations</Link></li>
              <li><Link href="/rewards">Available vouchers</Link></li>
              <li><Link href="/profile">Account Settings</Link></li>
              <li><Link href="/login">Member Portal</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="tomorro-footer-bottom">
          <span>© 2026 BravoForest. Recycling returns and customer rewards.</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/login">Sign In</Link>
            <Link href="/register">Create Account</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* =========================================================================
   CUSTOMER SHELL
   ========================================================================= */

export function CustomerShell({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Row>();
  const [balance, setBalance] = useState<number>();
  const [logoutMessage, setLogoutMessage] = useState('');
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    apiGet<Row>('/auth/me')
      .then(me => {
        setUser(me);
        setBalance(Number(me.wallet?.balance ?? 0));
      })
      .catch(() => {
        setUser(undefined);
        setBalance(undefined);
      });
  }, [pathname]);

  const logout = async () => {
    markSignedOut();
    try {
      await apiPost('/auth/logout', {});
      setLogoutMessage('');
    } catch {
      setLogoutMessage('Không thể xác nhận đăng xuất với máy chủ. Trình duyệt này sẽ không tự khôi phục phiên; hãy thử đăng nhập lại khi kết nối được khôi phục.');
    } finally {
      clearAccessToken();
      setUser(undefined);
      setBalance(undefined);
      router.push('/login');
    }
  };

  return (
    <div className="tomorro-app-shell">
      <UnifiedNavbar user={user} balance={balance} logout={logout} />
      <main className="tomorro-main-content">
        {pathname === '/login' && logoutMessage && <p role="alert" className="tomorro-container" style={{ color: '#fca5a5' }}>{logoutMessage}</p>}
        {children}
      </main>
      <UnifiedFooter />
    </div>
  );
}

/* =========================================================================
   PAGE 1: CUSTOMER LANDING PAGE
   ========================================================================= */

function Landing() {
  const landingRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    if (!landingRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('.tomorro-hero-headline', {
        opacity: 0,
        y: 25,
        duration: 0.9,
        ease: 'power3.out'
      });
      gsap.from('.tomorro-hero-cockpit', {
        opacity: 0,
        y: 35,
        duration: 1,
        delay: 0.15,
        ease: 'power3.out'
      });
    }, landingRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={landingRef} className="tomorro-landing-wrap">
      {/* SECTION 1: HERO (DEEP EMERALD FORESTRY + COCKPIT) */}
      <section className="tomorro-section-hero">
        <span className="eyebrow" style={{ display: 'inline-block', marginBottom: 18, color: 'var(--tomorro-fluo-green)', letterSpacing: '0.12em', fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}>
          GLOBAL CIRCULAR RVM NETWORK
        </span>
        <h1 className="tomorro-hero-headline">
          THE REVERSE VENDING INFRASTRUCTURE<br />
          <span className="text-highlight">FOR A ZERO-WASTE PLANET.</span>
        </h1>
        <p className="tomorro-hero-sub">
          High-throughput deposit return systems, sub-second optical material classification, and real-time verifiable ESG telemetry. <strong>Turn every container into traceable circular capital.</strong>
        </p>
        <div className="tomorro-hero-cta">
          <Link href="/machines" className="btn-tomorro-lime">Find RVM Terminals ↗</Link>
          <Link href="/register" className="btn-tomorro-dark-pill">Deploy Fleet &amp; Enterprise</Link>
        </div>
        <p className="tomorro-trust-note">
          Engineered for circular economy standards · ISO 14001 Compliant · 99.8% Sorting Accuracy
        </p>
        <div className="tomorro-hero-logos">
          <span>TOMORRA CIRCULAR</span>
          <span>ECO-DEPOSIT NORDIC</span>
          <span>CIRCLE-FEED EU</span>
          <span>VEOLIA RECYCLE</span>
          <span>CLEANOCEAN LABS</span>
        </div>

        {/* Hero Interactive Cockpit Preview */}
        <div className="tomorro-hero-cockpit">
          <div className="tomorro-cockpit-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ background: 'rgba(47,224,122,0.18)', border: '1px solid rgba(47,224,122,0.4)', color: '#2fe07a', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                TERMINAL BF-8041 ONLINE
              </span>
              <span style={{ color: '#8da294', fontSize: 13 }}>Throughput: 42 units/min</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9db4a6' }}>
              <span>OPTICAL CLASSIFICATION READY</span>
            </div>
          </div>
          <div className="tomorro-cockpit-body">
            <div
              className="tomorro-cockpit-left"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-cockpit-overlay" />
              <div className="tomorro-cockpit-content">
                <span className="eyebrow" style={{ color: '#2fe07a' }}>LIVE INFEED ZONE</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, textTransform: 'uppercase', color: '#fff', margin: '6px 0 8px' }}>
                  Deposit Your Container
                </h3>
                <p style={{ color: '#c4d9cd', fontSize: 13.5, margin: 0 }}>
                  360° barcode and spectrometer analysis detects PET clear, colored polymer, and aluminium cans.
                </p>
              </div>
            </div>
            <div className="tomorro-cockpit-right">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ color: '#8da294', fontSize: 13 }}>Active Sensor Array</span>
                  <span style={{ color: '#2fe07a', fontWeight: 600, fontSize: 13 }}>Active · Calibrated</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ color: '#8da294', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Instant Reward Payout</div>
                  <div style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, marginTop: 4 }}>+10 ECO pts / bottle</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ color: '#8da294', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Total Intake</div>
                  <div style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, marginTop: 4 }}>3,428 containers diverted</div>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <Link href="/machines" className="btn-tomorro-lime" style={{ width: '100%', justifyContent: 'center' }}>
                  Connect Session at Kiosk ↗
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: SPOTLIGHT "MEET ECO-VISION" (SUBMERGED BACKGROUND + BENTO SHOWCASE) */}
      <section className="tomorro-section-spotlight">
        <div className="tomorro-spotlight-bg" />
        <div className="tomorro-spotlight-overlay" />
        <div className="tomorro-spotlight-content">
          <div className="tomorro-3d-lens-wrapper">
            <div className="tomorro-3d-lens">
              <div className="tomorro-3d-lens-pupil" />
            </div>
          </div>
          <span className="eyebrow" style={{ display: 'inline-block', marginBottom: 14, color: 'var(--tomorro-fluo-green)', letterSpacing: '0.12em', fontWeight: 700, fontSize: 13, textTransform: 'uppercase' }}>
            MEET ECO-VISION
          </span>
          <h2 className="tomorro-spotlight-headline">
            SEEING EVERY CONTAINER AT 240 FPS.<br />
            <span className="text-highlight">ACCURACY BY DESIGN.</span>
          </h2>
          <p className="tomorro-spotlight-sub">
            Our patented high-speed computer vision engine identifies resin type, volume, barcode, and compaction integrity in under 0.28 seconds with zero contaminant tolerance.
          </p>
          <div className="tomorro-spotlight-chips">
            <span className="tomorro-spotlight-chip">SPECTRAL ANALYSIS</span>
            <span className="tomorro-spotlight-chip">SUB-SECOND COMPACTION</span>
            <span className="tomorro-spotlight-chip">ANTI-FRAUD GEO-STAMP</span>
            <span className="tomorro-spotlight-chip">OFFLINE BUFFERED LEDGER</span>
          </div>

          {/* Bento Showcase Grid: 1 BIG Card + 3 SMALL Cards */}
          <div className="tomorro-spotlight-bento">
            {/* 1. BIG CARD */}
            <article
              className="tomorro-bento-hero"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1600&q=85')` }}
            >
              <div className="tomorro-bento-hero-overlay" />
              <div className="tomorro-bento-hero-content">
                <span className="eyebrow" style={{ color: '#2fe07a' }}>FLAGSHIP RVM CHASSIS</span>
                <h3>Autonomous Deposit Terminals For Smart Cities</h3>
                <p>
                  Engineered with aerospace-grade steel, dual pneumatic flattener chutes, and high-capacity bin baling.
                  BravoForest RVM units sustain up to 3,500 daily deposits before auto-dispatching municipal collection trucks.
                </p>
                <div className="tomorro-bento-hero-chips">
                  <span className="tomorro-bento-hero-chip">1,200 Can Bin Capacity</span>
                  <span className="tomorro-bento-hero-chip">900 Bottle Flattener</span>
                  <span className="tomorro-bento-hero-chip">Zero Contamination Guarantee</span>
                </div>
              </div>
            </article>

            {/* 2. THREE SMALL CARDS */}
            <div className="tomorro-bento-row">
              <article
                className="tomorro-bento-card"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=85')` }}
              >
                <div className="tomorro-bento-card-overlay" />
                <div className="tomorro-bento-card-content">
                  <span className="eyebrow" style={{ color: '#2fe07a' }}>SENSOR SUITE</span>
                  <h4>Optical Laser Scanning</h4>
                  <p>360-degree multi-spectral infrared arrays analyze material density and reject non-recyclable contaminants.</p>
                </div>
              </article>

              <article
                className="tomorro-bento-card"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=85')` }}
              >
                <div className="tomorro-bento-card-overlay" />
                <div className="tomorro-bento-card-content">
                  <span className="eyebrow" style={{ color: '#2fe07a' }}>LEDGER &amp; REWARDS</span>
                  <h4>Interactive Touch Console</h4>
                  <p>Instant barcode scan, account balance sync, and dynamic digital voucher distribution via secure QR.</p>
                </div>
              </article>

              <article
                className="tomorro-bento-card"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1591193686104-fddba4d0e4d8?auto=format&fit=crop&w=800&q=85')` }}
              >
                <div className="tomorro-bento-card-overlay" />
                <div className="tomorro-bento-card-content">
                  <span className="eyebrow" style={{ color: '#2fe07a' }}>MECHANICAL SUITE</span>
                  <h4>Heavy-Duty Compactor</h4>
                  <p>Industrial hydraulic crushing reduces container volume by 80%, optimizing transport logistics.</p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: PITCH BLACK METRICS & ARCHITECTURE */}
      <section className="tomorro-section-black">
        <div className="tomorro-container">
          <div className="tomorro-black-metrics">
            <div className="tomorro-black-metric-item">
              <div className="tomorro-black-metric-num">53%</div>
              <div className="tomorro-black-metric-label">Average increase in residential return rates across pilot urban zones</div>
            </div>
            <div className="tomorro-black-metric-item">
              <div className="tomorro-black-metric-num">99.4%</div>
              <div className="tomorro-black-metric-label">Purity rate of PET flake output supplied to circular packaging partners</div>
            </div>
            <div className="tomorro-black-metric-item">
              <div className="tomorro-black-metric-num">3.4M+</div>
              <div className="tomorro-black-metric-label">Containers recovered and diverted from landfills and oceans</div>
            </div>
          </div>

          <h2 className="tomorro-black-headline">
            ARCHITECTED FOR URBAN SCALE.<br />
            <span className="text-highlight">READY FOR ENTERPRISE.</span>
          </h2>

          <div className="tomorro-pill-tabs">
            {['Overview', 'Fleet Management', 'Anti-Fraud & Audit', 'API & Webhooks'].map(tab => (
              <button
                key={tab}
                type="button"
                className={`tomorro-pill-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="tomorro-black-mock">
            {activeTab === 'Overview' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16, marginBottom: 20 }}>
                  <span style={{ color: '#2fe07a', fontWeight: 700, fontSize: 14 }}>SYSTEM DIAGNOSTIC · NODE BF-CORE-01</span>
                  <span style={{ color: '#8da294', fontSize: 13 }}>Latency: 18ms · Cluster: ap-southeast-1</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ color: '#8da294', fontSize: 12 }}>DEPOSIT SUCCESS RATE</div>
                    <div style={{ color: '#ffffff', fontSize: 24, fontWeight: 800, marginTop: 6 }}>99.82%</div>
                    <div style={{ color: '#2fe07a', fontSize: 12, marginTop: 4 }}>+0.4% from last update</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ color: '#8da294', fontSize: 12 }}>CLASSIFICATION SPEED</div>
                    <div style={{ color: '#ffffff', fontSize: 24, fontWeight: 800, marginTop: 6 }}>280 ms</div>
                    <div style={{ color: '#2fe07a', fontSize: 12, marginTop: 4 }}>Spectral AI Engine v4.2</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ color: '#8da294', fontSize: 12 }}>RECYCLED PET EMISSION SAVINGS</div>
                    <div style={{ color: '#ffffff', fontSize: 24, fontWeight: 800, marginTop: 6 }}>418.6 Tons</div>
                    <div style={{ color: '#2fe07a', fontSize: 12, marginTop: 4 }}>CO2 equivalent avoided</div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'Fleet Management' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16, marginBottom: 20 }}>
                  <span style={{ color: '#2fe07a', fontWeight: 700, fontSize: 14 }}>FLEET TELEMETRY &amp; ROUTE DISPATCH</span>
                  <span style={{ color: '#8da294', fontSize: 13 }}>52 Active Terminals · 4 In Service</span>
                </div>
                <p style={{ color: '#b2c8ba', fontSize: 14, lineHeight: 1.6 }}>
                  Smart load sensors continually measure hopper volume, compacted bale density, and bin temperature.
                  When capacity crosses 85%, autonomous collection dispatch triggers optimal routing for electric collection vans.
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                  <span style={{ background: 'rgba(47,224,122,0.12)', color: '#2fe07a', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>Hopper Fill: 48% Avg</span>
                  <span style={{ background: 'rgba(47,224,122,0.12)', color: '#2fe07a', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>Compactor Hydraulic: 120 Bar</span>
                  <span style={{ background: 'rgba(47,224,122,0.12)', color: '#2fe07a', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>Uptime: 99.94%</span>
                </div>
              </div>
            )}
            {activeTab === 'Anti-Fraud & Audit' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16, marginBottom: 20 }}>
                  <span style={{ color: '#2fe07a', fontWeight: 700, fontSize: 14 }}>CRYPTOGRAPHIC AUDIT TRAIL</span>
                  <span style={{ color: '#8da294', fontSize: 13 }}>Zero Barcode Re-Use Guarantee</span>
                </div>
                <p style={{ color: '#b2c8ba', fontSize: 14, lineHeight: 1.6 }}>
                  Every barcode scanned is immediately cross-checked against registered GS1 datasets and invalidated in the local offline cache.
                  Tamper-proof hardware counters record container volume and weight delta to prevent hollow or crushed duplicate deposits.
                </p>
                <div style={{ background: '#05120b', borderRadius: 10, padding: 14, marginTop: 14, fontFamily: 'monospace', fontSize: 12, color: '#2fe07a', border: '1px solid rgba(47,224,122,0.2)' }}>
                  [AUDIT] 14:02:19.412 TX_881920: BARCODE:8938501332014 WEIGHT:24.2g POLYMER:PET_CLEAR STATUS:ACCEPTED SIG:0x9a4f7e2c
                </div>
              </div>
            )}
            {activeTab === 'API & Webhooks' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16, marginBottom: 20 }}>
                  <span style={{ color: '#2fe07a', fontWeight: 700, fontSize: 14 }}>DEVELOPER REST &amp; WEBHOOK INTEGRATION</span>
                  <span style={{ color: '#8da294', fontSize: 13 }}>OpenAPI 3.1 · TLS 1.3 Strict</span>
                </div>
                <p style={{ color: '#b2c8ba', fontSize: 14, lineHeight: 1.6 }}>
                  Connect your loyalty app, ERP, or ESG reporting dashboard in minutes with our real-time event webhooks and authenticated REST endpoints.
                </p>
                <div style={{ background: '#05120b', borderRadius: 10, padding: 14, marginTop: 14, fontFamily: 'monospace', fontSize: 12, color: '#9db4a6', border: '1px solid rgba(255,255,255,0.08)' }}>
                  curl -X POST https://api.bravoforest.com/v1/sessions/verify \<br />
                  &nbsp;&nbsp;-H "Authorization: Bearer bf_live_token" \<br />
                  &nbsp;&nbsp;-d '{`{"machineId": "BF-8041", "points": 10}`}'
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 4: CRISP LIGHT OFF-WHITE ROLE GRID (HIGH CONTRAST SHIFT) */}
      <section className="tomorro-section-light">
        <div className="tomorro-container">
          <h2 className="tomorro-light-headline">
            BUILT FOR EVERY STAKEHOLDER IN THE RECYCLING CHAIN
          </h2>
          <p className="tomorro-light-sub">
            From daily conscious citizens to supermarket chains and municipal processors, BravoForest connects the full circular ecosystem.
          </p>

          <div className="tomorro-role-grid">
            <article
              className="tomorro-role-card"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-role-overlay">
                <div>
                  <h3>Citizens &amp; Households</h3>
                  <p>Turn beverage containers into green credits, retail vouchers, or tree-planting donations in seconds.</p>
                </div>
                <div className="tomorro-role-arrow">↗</div>
              </div>
            </article>

            <article
              className="tomorro-role-card"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-role-overlay">
                <div>
                  <h3>Universities &amp; Campuses</h3>
                  <p>Foster campus sustainability challenges with student leaderboards and zero-waste initiatives.</p>
                </div>
                <div className="tomorro-role-arrow">↗</div>
              </div>
            </article>

            <article
              className="tomorro-role-card"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-role-overlay">
                <div>
                  <h3>Supermarkets &amp; Retail</h3>
                  <p>Attract eco-conscious shoppers and automate mandatory bottle deposit scheme compliance.</p>
                </div>
                <div className="tomorro-role-arrow">↗</div>
              </div>
            </article>

            <article
              className="tomorro-role-card"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-role-overlay">
                <div>
                  <h3>Residential Apartments</h3>
                  <p>Clean, odor-sealed indoor sorting units integrated into lobby and basement collection points.</p>
                </div>
                <div className="tomorro-role-arrow">↗</div>
              </div>
            </article>

            <article
              className="tomorro-role-card"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-role-overlay">
                <div>
                  <h3>Circular Reprocessors</h3>
                  <p>Source contamination-free rPET and aluminium bales sorted by color and polymer grade.</p>
                </div>
                <div className="tomorro-role-arrow">↗</div>
              </div>
            </article>

            <article
              className="tomorro-role-card"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-role-overlay">
                <div>
                  <h3>Municipal Logistics</h3>
                  <p>Real-time bin fill notifications optimize vehicle routing and eliminate half-empty truck dispatches.</p>
                </div>
                <div className="tomorro-role-arrow">↗</div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* SECTION 5: STICKER BADGES & WARM TESTIMONIALS */}
      <section className="tomorro-section-testimonials">
        <div className="tomorro-container">
          <div className="tomorro-sticker-stack">
            <span className="tomorro-sticker-pill sticker-mint">DEPOSIT RETURN SYSTEMS</span>
            <span className="tomorro-sticker-pill sticker-lime">NEXT-GEN REVERSE VENDING</span>
            <span className="tomorro-sticker-pill sticker-mint">REAL IMPACT. VERIFIED.</span>
          </div>

          <div className="tomorro-testimonial-grid">
            <div className="tomorro-testimonial-card">
              <p className="tomorro-testimonial-quote">
                "BravoForest's optical detection completely eliminated false container deposits in our store network. Foot traffic increased 18% in the first month."
              </p>
              <div className="tomorro-testimonial-author">
                <div className="tomorro-testimonial-avatar">ML</div>
                <div>
                  <strong style={{ display: 'block', fontSize: 14, color: '#11291c' }}>Marcus Lindqvist</strong>
                  <span style={{ fontSize: 12, color: '#688272' }}>COO, Nordic Retail Co.</span>
                </div>
              </div>
            </div>

            <div className="tomorro-testimonial-card">
              <p className="tomorro-testimonial-quote">
                "Our university campus diverted 45,000 plastic bottles in one semester. Students love the instant reward wallet and mobile vouchers."
              </p>
              <div className="tomorro-testimonial-author">
                <div className="tomorro-testimonial-avatar">SC</div>
                <div>
                  <strong style={{ display: 'block', fontSize: 14, color: '#11291c' }}>Dr. Sarah Chen</strong>
                  <span style={{ fontSize: 12, color: '#688272' }}>Sustainability Chair, UniTech</span>
                </div>
              </div>
            </div>

            <div className="tomorro-testimonial-card">
              <p className="tomorro-testimonial-quote">
                "The cleanest baled rPET we've ever received from municipal collection. The compaction and color sorting saves us hours in pre-processing."
              </p>
              <div className="tomorro-testimonial-author">
                <div className="tomorro-testimonial-avatar">AD</div>
                <div>
                  <strong style={{ display: 'block', fontSize: 14, color: '#11291c' }}>Alain Dupont</strong>
                  <span style={{ fontSize: 12, color: '#688272' }}>Plant Director, CircularPlast</span>
                </div>
              </div>
            </div>

            <div className="tomorro-testimonial-card">
              <p className="tomorro-testimonial-quote">
                "Real-time telemetry and fill-level alerts cut our collection truck fuel consumption by 32%. A game-changer for municipal smart cities."
              </p>
              <div className="tomorro-testimonial-author">
                <div className="tomorro-testimonial-avatar">EV</div>
                <div>
                  <strong style={{ display: 'block', fontSize: 14, color: '#11291c' }}>Elena Vance</strong>
                  <span style={{ fontSize: 12, color: '#688272' }}>Director, Urban Logistics</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: GRAND PANORAMIC CLOSING CTA BANNER */}
      <section className="tomorro-section-cta">
        <div
          className="tomorro-cta-box"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1600&q=85')` }}
        >
          <div className="tomorro-cta-overlay" />
          <div className="tomorro-cta-content">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 5.2vw, 64px)', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1.02, margin: '0 0 18px', letterSpacing: '-0.015em' }}>
              JOIN THE CLOSED-LOOP <br />REVOLUTION TODAY.
            </h2>
            <p style={{ color: '#d0e5d8', fontSize: 17, maxWidth: 620, margin: '0 auto 34px', lineHeight: 1.6 }}>
              Find your nearest reverse vending kiosk or connect your business to BravoForest's circular economy network.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/machines" className="btn-tomorro-lime">Find Nearest RVM ↗</Link>
              <Link href="/register" className="btn-tomorro-dark-pill">Create Customer Account</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
/* =========================================================================
   PAGE 2: AUTH (LOGIN & REGISTER IN ENGLISH)
   ========================================================================= */

function Auth({ register = false }: { register?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = register
      ? {
          fullName: fd.get('fullName'),
          email: fd.get('email') || undefined,
          phone: fd.get('phone') || undefined,
          password: fd.get('password')
        }
      : {
          identifier: fd.get('identifier'),
          password: fd.get('password')
        };
    try {
      const result = await apiPost<{ accessToken: string }>(
        register ? '/auth/register' : '/auth/login',
        body
      );
      localStorage.setItem('bravoforest_access_token', result.accessToken);
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to connect to the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tomorro-auth-wrap">
      <div className="tomorro-auth-card">
        {/* Tab Switcher: Sign In | Register */}
        <div className="tomorro-auth-tabs">
          <Link
            href="/login"
            className={`tomorro-auth-tab ${!register ? 'active' : ''}`}
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className={`tomorro-auth-tab ${register ? 'active' : ''}`}
          >
            Create Account
          </Link>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, textTransform: 'uppercase', letterSpacing: -0.5, margin: '0 0 8px', color: '#ffffff' }}>
            {register ? 'START YOUR GREEN HABIT.' : 'WELCOME BACK.'}
          </h1>
          <p style={{ color: '#9db4a6', fontSize: 13.5, margin: 0 }}>
            {register
              ? 'Create an account to view your points balance, return history, and available vouchers.'
              : 'Sign in to view your points balance and recorded return sessions.'}
          </p>
        </div>

        {/* Form Stack */}
        <form onSubmit={submit}>
          {register && (
            <div className="tomorro-field">
              <label>Full Name</label>
              <input
                className="tomorro-input"
                name="fullName"
                placeholder="e.g. Alex Morgan"
                required
              />
            </div>
          )}

          {register ? (
            <>
              <div className="tomorro-field">
                <label>Email Address</label>
                <input
                  className="tomorro-input"
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                />
              </div>
              <div className="tomorro-field">
                <label>Phone Number</label>
                <input
                  className="tomorro-input"
                  name="phone"
                  type="tel"
                  placeholder="Phone number"
                />
              </div>
            </>
          ) : (
            <div className="tomorro-field">
              <label>Email or Phone Number</label>
              <input
                className="tomorro-input"
                name="identifier"
                placeholder="user@email.com or phone..."
                required
              />
            </div>
          )}

          <div className="tomorro-field">
            <label>Password</label>
            <input
              className="tomorro-input"
              name="password"
              type="password"
              placeholder="Minimum 10 characters"
              required
              minLength={register ? 10 : undefined}
            />
          </div>

          <button
            disabled={busy}
            className="btn-tomorro-lime"
            type="submit"
            style={{ width: '100%', justifyContent: 'center', padding: '13px 20px', fontSize: 14.5, marginTop: 12 }}
          >
            {busy ? 'Verifying…' : register ? 'Create Free Account ↗' : 'Sign In to Account ↗'}
          </button>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: 12, fontSize: 13, textAlign: 'center', marginTop: 14 }}>
              {error}
            </div>
          )}
        </form>

        {/* Benefits Strip */}
        <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 8, fontSize: 12.5, color: '#9cb1a4' }}>
          <div>✓ View account balance and recorded point transactions</div>
          <div>✓ Browse vouchers currently available in the catalog</div>
          <div>✓ Track voucher redemption status in your account</div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 3: CUSTOMER DASHBOARD
   ========================================================================= */

function Dashboard() {
  const me = useApi<Row>('/users/me');
  const sessions = useApi<unknown>('/sessions');
  const user = me.data;
  const sessionRows = rowsFrom<Row>(sessions.data);
  const recycling = user?.recycling ?? {};
  const acceptedItems = Number(recycling.items_accepted ?? sessionRows.reduce((sum, row) => sum + Number(val(row, 'items_accepted') || 0), 0));
  const earnedPoints = Number(recycling.points_earned ?? sessionRows.reduce((sum, row) => sum + Number(val(row, 'points_credited', 'points') || 0), 0));
  const sessionCount = Number(recycling.sessions ?? sessionRows.length);
  const currentBalance = user?.balance === undefined && user?.wallet?.balance === undefined
    ? null
    : Number(user.balance ?? user.wallet.balance);
  const memberName = String(val(user ?? {}, 'fullName', 'full_name') || '');

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <span className="eyebrow">CUSTOMER ACCOUNT</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
              {memberName ? 'Chào ' + memberName : 'Tổng quan tài khoản'}
            </h1>
            <p style={{ color: '#a3baad', margin: 0, fontSize: 14.5 }}>
              Số liệu dưới đây lấy từ tài khoản và các phiên được hệ thống ghi nhận.
            </p>
          </div>
          <Link href="/machines" className="btn-tomorro-lime" style={{ padding: '12px 24px', fontSize: 14 }}>
            Xem điểm tiếp nhận ↗
          </Link>
        </div>
      </div>

      {me.error && <div role="alert" className="tomorro-card" style={{ marginBottom: 20, color: '#fca5a5' }}>{me.error}</div>}

      <div className="grid-4" style={{ marginBottom: 28, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
        <div className="tomorro-metric">
          <div className="tomorro-metric-top"><span>SỐ DƯ ĐIỂM</span><span>✳</span></div>
          <strong className="tomorro-metric-val">{me.loading ? '…' : currentBalance === null ? '—' : currentBalance.toLocaleString() + ' pts'}</strong>
          <span className="tomorro-metric-sub">Số dư ví hiện tại</span>
        </div>
        <div className="tomorro-metric">
          <div className="tomorro-metric-top"><span>BAO BÌ ĐƯỢC NHẬN</span><span>♻</span></div>
          <strong className="tomorro-metric-val">{me.loading ? '…' : acceptedItems.toLocaleString()}</strong>
          <span className="tomorro-metric-sub">Tổng số lượng theo phiên</span>
        </div>
        <div className="tomorro-metric">
          <div className="tomorro-metric-top"><span>PHIÊN GỬI</span><span>↻</span></div>
          <strong className="tomorro-metric-val">{me.loading ? '…' : sessionCount.toLocaleString()}</strong>
          <span className="tomorro-metric-sub">Tổng số phiên được ghi nhận</span>
        </div>
        <div className="tomorro-metric">
          <div className="tomorro-metric-top"><span>ĐIỂM ĐÃ NHẬN</span><span>↗</span></div>
          <strong className="tomorro-metric-val">{me.loading ? '…' : earnedPoints.toLocaleString() + ' pts'}</strong>
          <span className="tomorro-metric-sub">Theo dữ liệu phiên tái chế</span>
        </div>
      </div>

      <div className="tomorro-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', margin: 0, color: '#ffffff' }}>Lịch sử phiên gần đây</h2>
          <Link href="/history" style={{ fontSize: 13, fontWeight: 700, color: 'var(--tomorro-fluo-green)' }}>Xem toàn bộ lịch sử →</Link>
        </div>
        <ApiMessage loading={sessions.loading} error={sessions.error} empty={!sessionRows.length}>
          <div className="tomorro-table-wrap">
            <table className="tomorro-table">
              <thead><tr><th>Thời gian</th><th>Mã phiên</th><th>Trạng thái</th><th>Số lượng nhận</th><th style={{ textAlign: 'right' }}>Điểm</th></tr></thead>
              <tbody>
                {sessionRows.slice(0, 5).map((row, index) => (
                  <tr key={String(val(row, 'session_id', 'sessionId') || index)}>
                    <td>{fmtDate(val(row, 'started_at', 'startedAt'))}</td>
                    <td>#{val(row, 'session_id', 'sessionId')}</td>
                    <td><Pill tone={val(row, 'status') === 'COMPLETED' ? 'green' : 'amber'}>{val(row, 'status') || '—'}</Pill></td>
                    <td>{Number(val(row, 'items_accepted') || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--tomorro-fluo-green)', fontWeight: 800 }}>
                      {Number(val(row, 'points_credited', 'points') || 0).toLocaleString()} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ApiMessage>
      </div>
    </div>
  );
}
/* =========================================================================
   PAGE 4: VOUCHER CATALOG
   ========================================================================= */

interface RewardItem {
  id: number;
  brand: string;
  category: string;
  title: string;
  description: string;
  pointsCost: number;
  fulfillmentType: string;
  availableCodes?: number;
}

function Rewards() {
  const result = useApi<unknown>('/vouchers');
  const account = useApi<Row>('/users/me');
  const rows = rowsFrom<Row>(result.data);
  const [pending, setPending] = useState<number>();
  const [selectedReward, setSelectedReward] = useState<RewardItem | null>(null);
  const [redemption, setRedemption] = useState<Row | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');

  const catalog: RewardItem[] = useMemo(() => rows.map((row) => ({
    id: Number(val(row, 'voucher_id', 'id')),
    brand: String(val(row, 'partner_name', 'partnerName') || ''),
    category: String(val(row, 'category_name', 'categoryName') || 'Other'),
    title: String(val(row, 'title') || ''),
    description: String(val(row, 'description', 'terms') || ''),
    pointsCost: Number(val(row, 'points_cost', 'pointsCost')),
    fulfillmentType: String(val(row, 'fulfillment_type', 'fulfillmentType') || ''),
    availableCodes: val(row, 'fulfillment_type', 'fulfillmentType') === 'CODE_POOL' ? Number(val(row, 'codes_available')) : undefined,
  })).filter((item) => Number.isInteger(item.id) && item.id > 0 && item.title && Number.isFinite(item.pointsCost)), [rows]);

  const categories = useMemo(() => Array.from(new Set(catalog.map((item) => item.category)), (category) => category), [catalog]);
  const filteredCatalog = useMemo(() => catalog.filter((item) => {
    const matchCategory = activeCategory === 'all' || item.category === activeCategory;
    const query = searchQuery.trim().toLocaleLowerCase();
    const matchQuery = !query || item.title.toLocaleLowerCase().includes(query) || item.brand.toLocaleLowerCase().includes(query);
    return matchCategory && matchQuery;
  }), [catalog, activeCategory, searchQuery]);

  async function handleRedeem(reward: RewardItem) {
    setPending(reward.id);
    setMessage('');
    try {
      const response = await apiPost<Row>('/redemptions', {
        voucherId: reward.id,
        idempotencyKey: crypto.randomUUID(),
      });
      setRedemption(response);
      setSelectedReward(reward);
      result.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể gửi yêu cầu đổi voucher.');
    } finally {
      setPending(undefined);
    }
  }

  const balance = account.data?.balance ?? account.data?.wallet?.balance;

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <span className="eyebrow">VOUCHER ĐANG MỞ</span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
              Đổi điểm lấy voucher
            </h1>
            <p style={{ color: '#a1b7a9', margin: 0, fontSize: 14.5 }}>
              Danh mục và chi phí điểm được lấy từ các voucher đang hoạt động.
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px 24px', borderRadius: 20, border: '1px solid rgba(47,224,122,0.25)', textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: '#8da295', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>SỐ DƯ ĐIỂM</span>
            <strong style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 28, color: 'var(--tomorro-fluo-green)' }}>
              {account.loading ? '…' : balance === undefined || balance === null ? '—' : Number(balance).toLocaleString()}
              <span style={{ fontSize: 14, fontWeight: 500 }}> pts</span>
            </strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', ...categories].map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={'button ' + (activeCategory === category ? 'btn-tomorro-lime' : 'btn-tomorro-dark-pill')}
              style={{ padding: '8px 18px', fontSize: 13 }}
            >
              {category === 'all' ? 'Tất cả' : category}
            </button>
          ))}
        </div>
        <div style={{ minWidth: 260 }}>
          <input
            type="search"
            className="tomorro-input"
            placeholder="Tìm voucher hoặc đối tác"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            style={{ borderRadius: 9999, padding: '10px 18px', fontSize: 13 }}
          />
        </div>
      </div>

      {message && <div className="tomorro-card" role="alert" style={{ marginBottom: 20, borderColor: '#f87171', color: '#fca5a5' }}>{message}</div>}

      <ApiMessage loading={result.loading} error={result.error} empty={filteredCatalog.length === 0}>
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {filteredCatalog.map((item) => (
            <div key={item.id} className="tomorro-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', fontSize: 24 }}>✳</div>
                  <span className="pill pill-green" style={{ fontSize: 10.5 }}>
                    {item.availableCodes === undefined ? 'Đang mở' : item.availableCodes + ' mã còn lại'}
                  </span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a9e86', display: 'block', marginBottom: 4 }}>
                  {item.brand || 'Đối tác'}
                </span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', color: '#ffffff', margin: '0 0 8px' }}>{item.title}</h3>
                {item.description && <p style={{ color: '#9db4a6', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>{item.description}</p>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, fontSize: 16, color: 'var(--tomorro-fluo-green)' }}>
                  ✳ {item.pointsCost.toLocaleString()} <small style={{ fontSize: 12, fontWeight: 500, color: '#7a9183' }}>pts</small>
                </div>
                <button
                  disabled={pending === item.id || (item.availableCodes !== undefined && item.availableCodes < 1)}
                  className="btn-tomorro-lime"
                  style={{ padding: '8px 18px', fontSize: 12.5 }}
                  onClick={() => handleRedeem(item)}
                >
                  {pending === item.id ? 'Đang gửi…' : 'Đổi voucher ↗'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </ApiMessage>

      {selectedReward && redemption && (
        <div className="modal-overlay" onClick={() => { setSelectedReward(null); setRedemption(null); }}>
          <div className="tomorro-auth-card" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(47,224,122,0.15)', border: '1px solid var(--tomorro-fluo-green)', display: 'grid', placeItems: 'center', fontSize: 32, margin: '0 auto 14px' }}>✳</div>
              <span className="pill pill-green" style={{ marginBottom: 8 }}>YÊU CẦU ĐÃ ĐƯỢC GỬI</span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, textTransform: 'uppercase', margin: '6px 0', color: '#ffffff' }}>
                Đang xử lý voucher
              </h2>
              <p style={{ color: '#9cb1a4', fontSize: 13.5, margin: 0 }}>
                Yêu cầu đổi “{selectedReward.title}” đã được tiếp nhận. Mã voucher sẽ hiển thị trong ví sau khi đối tác xử lý thành công.
              </p>
              <p style={{ color: '#9cb1a4', fontSize: 12, margin: '12px 0 0' }}>
                Mã yêu cầu: {val(redemption, 'redemptionId', 'redemption_id') || '—'} · Trạng thái: {val(redemption, 'status') || 'PENDING'}
              </p>
            </div>
            <Link href="/vouchers" className="btn-tomorro-lime" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { setSelectedReward(null); setRedemption(null); }}>
              Xem ví voucher
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
/* =========================================================================
   PAGE 5: WALLET (UNIFIED IN ENGLISH)
   ========================================================================= */

function Wallet() {
  const me = useApi<Row>('/auth/me');
  const tx = useApi<unknown>('/wallet/transactions');
  const rows = rowsFrom<Row>(tx.data);

  const balance = me.data?.wallet?.balance === undefined ? null : Number(me.data.wallet.balance);
  const totalIn = me.data?.wallet?.total_in === undefined ? null : Number(me.data.wallet.total_in);
  const totalOut = me.data?.wallet?.total_out === undefined ? null : Math.abs(Number(me.data.wallet.total_out));

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          ĐIỂM THƯỞNG
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          Green Points Wallet & Audit Ledger
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Số dư và các thay đổi điểm được lấy từ lịch sử giao dịch của tài khoản.
        </p>
      </div>

      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 28 }}>
        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>AVAILABLE BALANCE</span>
            <span style={{ color: 'var(--tomorro-fluo-green)' }}>✳</span>
          </div>
          <strong className="tomorro-metric-val">{me.loading ? '…' : balance === null ? '—' : balance.toLocaleString() + ' pts'}</strong>
          <span className="tomorro-metric-sub">Ready for redemption</span>
        </div>

        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>CUMULATIVE EARNED</span>
            <span style={{ color: 'var(--tomorro-fluo-green)' }}>↗</span>
          </div>
          <strong className="tomorro-metric-val">{me.loading ? '…' : totalIn === null ? '—' : '+' + totalIn.toLocaleString() + ' pts'}</strong>
          <span className="tomorro-metric-sub">From verified infeed sessions</span>
        </div>

        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>REDEEMED FOR VOUCHERS</span>
            <span style={{ color: '#f59e0b' }}>↘</span>
          </div>
          <strong className="tomorro-metric-val">{me.loading ? '…' : totalOut === null ? '—' : '-' + totalOut.toLocaleString() + ' pts'}</strong>
          <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>Partner gifts and perks</span>
        </div>
      </div>

      <div className="tomorro-card">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', margin: '0 0 16px', color: '#ffffff' }}>
          Audit Transaction History
        </h2>
        <ApiMessage loading={tx.loading || me.loading} error={tx.error || me.error} empty={!rows.length}>
          <div className="tomorro-table-wrap">
            <table className="tomorro-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Transaction Type</th>
                  <th>Note / Session ID</th>
                  <th style={{ textAlign: 'right' }}>Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtDate(val(r, 'created_at', 'createdAt'))}</td>
                    <td>
                      <span className="pill" style={{ background: 'rgba(255,255,255,0.06)', color: '#ffffff' }}>
                        {val(r, 'txn_type', 'txnType')}
                      </span>
                    </td>
                    <td style={{ color: '#9cb1a4' }}>{val(r, 'note') || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: Number(val(r, 'points') || 0) >= 0 ? 'var(--tomorro-fluo-green)' : '#f59e0b' }}>
                      {Number(val(r, 'points') || 0) >= 0 ? '+' : ''}{Number(val(r, 'points') || 0).toLocaleString()} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ApiMessage>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 6: HISTORY (UNIFIED IN ENGLISH)
   ========================================================================= */

function History() {
  const result = useApi<unknown>('/sessions');
  const rows = rowsFrom<Row>(result.data);

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          ECOLOGICAL FOOTPRINT
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          Past RVM Infeed Sessions
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Các phiên tái chế được hệ thống ghi nhận cho tài khoản này.
        </p>
      </div>

      <div className="tomorro-card">
        <ApiMessage loading={result.loading} error={result.error} empty={!rows.length}>
          <div className="tomorro-table-wrap">
            <table className="tomorro-table">
              <thead>
                <tr>
                  <th>Started At</th>
                  <th>Completed At</th>
                  <th>Session ID</th>
                  <th>Verification</th>
                  <th style={{ textAlign: 'right' }}>Dividend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtDate(val(r, 'started_at', 'startedAt'))}</td>
                    <td>{fmtDate(val(r, 'completed_at', 'completedAt'))}</td>
                    <td style={{ fontFamily: 'monospace' }}>#{val(r, 'session_id', 'sessionId')}</td>
                    <td>
                      <Pill tone={val(r, 'status') === 'COMPLETED' ? 'green' : 'amber'}>
                        {val(r, 'status')}
                      </Pill>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--tomorro-fluo-green)' }}>
                      +{Number(val(r, 'points') || 0).toLocaleString()} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ApiMessage>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 7: MACHINES (UNIFIED IN ENGLISH)
   ========================================================================= */

function Machines() {
  const locations = useApi<unknown>('/locations');
  const map = useApi<unknown>('/map');
  const rows = rowsFrom<Row>(locations.data);
  const mapPoints = useMemo(() => rowsFrom<Row>(map.data).filter((row) => val(row, 'latitude') !== '' && val(row, 'longitude') !== '').map((row) => ({
    id: Number(val(row, 'location_id', 'id')),
    name: String(val(row, 'name') || ''),
    address: [val(row, 'address'), val(row, 'ward'), val(row, 'district'), val(row, 'city')].filter(Boolean).join(', '),
    latitude: Number(val(row, 'latitude')),
    longitude: Number(val(row, 'longitude')),
    machineCount: Number(val(row, 'machine_count', 'machineCount') || 0),
  })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)), [map.data]);

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          ĐỊA ĐIỂM ĐƯỢC CÔNG KHAI
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          Find an RVM Station Near You
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Bản đồ và danh sách được tạo từ địa điểm có tọa độ trong hệ thống.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 }}>
        <div className="tomorro-card" style={{ padding: 12 }}>
          <ApiMessage loading={map.loading} error={map.error} empty={!mapPoints.length}>
            <RvmMap points={mapPoints} />
          </ApiMessage>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <ApiMessage loading={locations.loading} error={locations.error} empty={!rows.length}>
            {rows.map((r, i) => (
              <div key={val(r, 'id', 'location_id') || i} className="tomorro-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Pill tone={val(r, 'isActive', 'is_active') === false ? 'red' : 'green'}>
                      {val(r, 'isActive', 'is_active') === false ? 'Ngừng hoạt động' : 'Địa điểm đang mở'}
                    </Pill>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', margin: '10px 0 4px', color: '#ffffff' }}>
                      {val(r, 'name')}
                    </h3>
                    <small style={{ color: '#8da295' }}>
                      {[val(r, 'address'), val(r, 'ward'), val(r, 'district'), val(r, 'city')].filter(Boolean).join(', ')}
                    </small>
                  </div>
                  <strong style={{ color: 'var(--tomorro-fluo-green)', fontFamily: 'var(--font-display)', fontSize: 22 }}>
                      {Number(val(r, 'active_machines', 'machine_count', 'machineCount') || 0)} máy
                  </strong>
                </div>
              </div>
            ))}
          </ApiMessage>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 8: VOUCHERS (UNIFIED IN ENGLISH)
   ========================================================================= */

function Vouchers() {
  const result = useApi<unknown>('/redemptions');
  const rows = rowsFrom<Row>(result.data);

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          VOUCHER WALLET
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          My Claimed Partner Vouchers
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Trạng thái voucher được đồng bộ từ các yêu cầu đổi điểm của bạn.
        </p>
      </div>

      <div className="tomorro-card">
        <ApiMessage loading={result.loading} error={result.error} empty={!rows.length}>
          <div className="tomorro-table-wrap">
            <table className="tomorro-table">
              <thead>
                <tr>
                  <th>Redeemed At</th>
                  <th>Voucher Item</th>
                  <th>Partner Brand</th>
                  <th>Status</th>
                  <th>Valid Until</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtDate(val(r, 'created_at', 'createdAt'))}</td>
                    <td style={{ fontWeight: 700 }}>{val(r, 'title', 'voucher_title')}</td>
                    <td style={{ color: '#8da295' }}>{val(r, 'partner_name', 'partnerName')}</td>
                    <td>
                      <Pill tone={val(r, 'status') === 'ISSUED' ? 'green' : 'default'}>
                        {val(r, 'status')}
                      </Pill>
                    </td>
                    <td style={{ color: '#8da295' }}>{fmtDate(val(r, 'expires_at', 'expiresAt'))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ApiMessage>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 9: PROFILE (UNIFIED IN ENGLISH)
   ========================================================================= */

function Profile() {
  const me = useApi<Row>('/auth/me');
  const [message, setMessage] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await apiPatch('/auth/me', { fullName: fd.get('fullName'), phone: fd.get('phone') || undefined });
      setMessage('Profile updated successfully.');
      me.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to update profile.');
    }
  };

  const user = me.data;

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          MEMBER IDENTITY
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          Personal Account Settings
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Manage your credentials and preferences across the BravoForest ecological ecosystem.
        </p>
      </div>

      <div className="tomorro-card" style={{ maxWidth: 640 }}>
        <ApiMessage loading={me.loading} error={me.error}>
          {user && (
            <form onSubmit={submit}>
              <div className="tomorro-field">
                <label>Full Name</label>
                <input
                  className="tomorro-input"
                  name="fullName"
                  defaultValue={val(user, 'fullName', 'full_name')}
                  required
                />
              </div>

              <div className="tomorro-field">
                <label>Primary Account Email (Immutable)</label>
                <input
                  className="tomorro-input"
                  name="email"
                  type="email"
                  defaultValue={val(user, 'email')}
                  disabled
                  style={{ opacity: 0.6 }}
                />
              </div>

              <div className="tomorro-field">
                <label>Phone Number</label>
                <input
                  className="tomorro-input"
                  name="phone"
                  type="tel"
                  defaultValue={val(user, 'phone')}
                  placeholder="+1 (555) 019-2834"
                />
              </div>

              <button className="btn-tomorro-lime" style={{ marginTop: 10 }}>
                Save Profile Changes ↗
              </button>

              {message && (
                <div style={{ color: 'var(--tomorro-fluo-green)', fontWeight: 600, fontSize: 13, marginTop: 12 }}>
                  ✓ {message}
                </div>
              )}
            </form>
          )}
        </ApiMessage>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 10: MACHINE LOGIN (UNIFIED IN ENGLISH)
   ========================================================================= */

function MachineLogin() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const token = new FormData(e.currentTarget).get('qrToken');
    try {
      const data = await apiPost<Row>('/sessions/claim', { qrToken: token });
      setMessage(`Session #${val(data, 'sessionId', 'session_id')} paired successfully.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to pair infeed session.');
    }
  };

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          RVM HARDWARE PAIRING
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          Enter Kiosk Screen Code
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Enter the one-time code displayed by a machine to link its session to your account. Points appear after the machine submits a completed result.
        </p>
      </div>

      <div className="tomorro-card" style={{ maxWidth: 500 }}>
        <form onSubmit={submit}>
          <div className="tomorro-field">
            <label>One-time code shown on the machine</label>
            <input
              className="tomorro-input"
              name="qrToken"
              placeholder="Enter the code shown on the machine"
              required
            />
          </div>
          <button className="btn-tomorro-lime">
            Pair Infeed Session ↗
          </button>
          {message && <div style={{ color: 'var(--tomorro-fluo-green)', fontWeight: 600, marginTop: 10 }}>✓ {message}</div>}
          {error && <div style={{ color: '#f87171', fontWeight: 600, marginTop: 10 }}>✕ {error}</div>}
        </form>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE ROUTER
   ========================================================================= */

export function CustomerPage({ route }: { route: string }) {
  if (route === 'home' || route === '') return <Landing />;
  if (route === 'login') return <Auth />;
  if (route === 'register') return <Auth register />;
  if (route === 'dashboard') return <Dashboard />;
  if (route === 'wallet') return <Wallet />;
  if (route === 'history') return <History />;
  if (route === 'machines' || route === 'machines/detail') return <Machines />;
  if (route === 'rewards') return <Rewards />;
  if (route === 'vouchers') return <Vouchers />;
  if (route === 'profile') return <Profile />;
  if (route === 'machine-login') return <MachineLogin />;
  return (
    <div className="tomorro-container" style={{ textAlign: 'center', padding: '80px 24px' }}>
      <div className="tomorro-card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, textTransform: 'uppercase', color: '#ffffff' }}>Page Not Found</h2>
        <p style={{ color: '#9db4a6' }}>The requested page is currently unavailable.</p>
        <Link href="/" className="btn-tomorro-lime" style={{ marginTop: 12 }}>
          Return to Home ↗
        </Link>
      </div>
    </div>
  );
}
