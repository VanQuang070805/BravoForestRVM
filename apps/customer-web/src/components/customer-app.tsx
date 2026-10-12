'use client';
import { useEffect, useState, useMemo, useRef, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import gsap from 'gsap';
import { Button, Card, Pill } from '@bravoforest/ui';
import { apiGet, apiPatch, apiPost, clearAccessToken, ApiError } from '../lib/api';
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
  if (loading) return <div className="tomorro-card" role="status" style={{ padding: 32, textAlign: 'center', color: '#9db4a6' }}>Loading telemetry data…</div>;
  if (error) return <div className="tomorro-card" role="alert" style={{ padding: 24, borderColor: '#f87171', color: '#fca5a5' }}><strong>Unable to fetch data</strong><p style={{ margin: '6px 0 0', color: '#f87171' }}>{error}</p></div>;
  if (empty) return <div style={{ border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 16, padding: 36, textAlign: 'center', color: '#8aa192' }}>No entries recorded in this category yet.</div>;
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
                <span>✳</span> {(balance ?? 2480).toLocaleString()} pts
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
              The pioneering Reverse Vending Machine (RVM) network accelerating the circular economy. Transforming post-consumer containers into verified environmental dividends.
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
              <li><Link href="/machine-login">Pair Infeed Session</Link></li>
              <li><a href="#features">AI Spectral Optics</a></li>
              <li><a href="#impact">Audited CO₂ Reductions</a></li>
            </ul>
          </div>

          {/* Links Column 3 */}
          <div className="tomorro-footer-col">
            <h4>PARTNERS & SUPPORT</h4>
            <ul>
              <li><a href="mailto:partners@bravoforest.com">Brand Partnerships</a></li>
              <li><a href="mailto:support@bravoforest.com">support@bravoforest.com</a></li>
              <li><Link href="/profile">Account Settings</Link></li>
              <li><Link href="/login">Member Portal</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="tomorro-footer-bottom">
          <span>© 2026 BravoForest SAS. Autonomous Reverse Vending Network. Engineered with 3NF Schema & Tomorro Editorial Design.</span>
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

  const logout = () => {
    clearAccessToken();
    setUser(undefined);
    setBalance(undefined);
    router.push('/login');
  };

  return (
    <div className="tomorro-app-shell">
      <UnifiedNavbar user={user} balance={balance} logout={logout} />
      <main className="tomorro-main-content">
        {children}
      </main>
      <UnifiedFooter />
    </div>
  );
}

/* =========================================================================
   PAGE 1: LANDING PAGE (REDESIGNED TOMORRO SECTIONS & CRISP RVM IMAGERY)
   ========================================================================= */

function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'scan' | 'sort' | 'wallet' | 'compact'>('scan');

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-anim-title', { opacity: 0, y: 35, duration: 1.1, ease: 'power4.out' });
      gsap.from('.hero-anim-sub', { opacity: 0, y: 25, duration: 0.9, delay: 0.2, ease: 'power3.out' });
      gsap.from('.hero-anim-cta', { opacity: 0, y: 20, duration: 0.8, delay: 0.35, ease: 'power3.out' });
      gsap.from('.tomorro-hero-cockpit', { opacity: 0, y: 40, duration: 1.1, delay: 0.45, ease: 'power3.out' });
    }, heroRef);
    return () => ctx.revert();
  }, []);

  const tabPreviews = {
    scan: {
      step: 'PHASE 01 / INFEED',
      title: 'Automated 360° Barcode & Optical Shape Recognition',
      desc: 'High-speed omnidirectional barcode scanners cross-reference container registrations against certified packaging databases within 0.3 seconds.',
      status: 'VERIFIED: VALID (PET 500ML CLEAR)',
      metric: '0.3s Recognition Speed',
      pts: '+10 Green Points Issued'
    },
    sort: {
      step: 'PHASE 02 / ANALYSIS',
      title: 'Multi-Spectral AI Sensor Polymer Sorting',
      desc: 'Near-infrared spectral sensors measure optical refraction indices, isolating polymer resin types and automatically rejecting containers with remaining liquids.',
      status: 'PURITY GRADE: 99.8% FOOD-SAFE rPET',
      metric: '99.8% Resin Accuracy',
      pts: 'Zero Stream Contamination'
    },
    wallet: {
      step: 'PHASE 03 / REWARD',
      title: 'Real-Time Ledger Transaction & Green Dividend',
      desc: 'Atomic database transactions record material collection logs into the certified MariaDB ledger, depositing green dividends to customer wallets immediately.',
      status: 'LEDGER COMMIT: #TXN-9842 COMMITTED',
      metric: 'Instant Wallet Credit',
      pts: 'Immediate Brand Voucher Unlocked'
    },
    compact: {
      step: 'PHASE 04 / COMPACTION',
      title: 'On-Site 85% Volumetric Compaction',
      desc: 'Integrated electro-mechanical crushers reduce container volume by up to 85%, allowing a single compact RVM station to hold up to 1,200 bottles before pickup.',
      status: 'CAPACITY STATUS: 1,200 BOTTLES STORED',
      metric: '85% Volume Reduction',
      pts: '40% Fleet Emission Reduction'
    }
  };

  const currentTab = tabPreviews[activeTab];

  return (
    <div ref={heroRef} style={{ width: '100%', margin: 0, padding: 0 }}>
      {/* -----------------------------------------------------------------
          SECTION 1: HERO SECTION (DEEP EMERALD FORESTRY)
          ----------------------------------------------------------------- */}
      <section className="tomorro-section-hero">
        <h1 className="tomorro-hero-headline hero-anim-title">
          REVERSE VENDING,<br />
          POWERED BY THE REVOLUTION OF <span className="text-highlight">AI</span>
        </h1>
        <p className="tomorro-hero-sub hero-anim-sub">
          Automate post-consumer beverage packaging recovery through next-generation intelligent Reverse Vending Machines. Deposit PET bottles and cans, verify purity instantly, and claim immediate <strong>green dividends</strong>.
        </p>

        <div className="tomorro-hero-cta hero-anim-cta">
          <Link href="/machines" className="btn-tomorro-lime">
            Find Nearby RVM ↗
          </Link>
          <a href="#features" className="btn-tomorro-dark-pill">
            ▶ Explore Optical Sensor Engine
          </a>
        </div>

        <p className="tomorro-trust-note">
          Trusted by over 50,000 active recyclers and 140+ sustainable enterprise partners
        </p>

        {/* Monochrome Partner Logos */}
        <div className="tomorro-hero-logos">
          <span>PATAGONIA</span>
          <span>UNILEVER</span>
          <span>STARBUCKS</span>
          <span>DECATHLON</span>
          <span>CIRCLE K</span>
          <span>VEOLIA</span>
        </div>

        {/* High-Tech Interactive Hardware Cockpit Showcase */}
        <div className="tomorro-hero-cockpit">
          <div className="tomorro-cockpit-bar">
            <strong style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, color: '#ffffff' }}>
              RVM Station #BF-RVM-001 · Central Eco Promenade
            </strong>
            <span style={{ background: 'rgba(47,224,122,0.14)', color: 'var(--tomorro-fluo-green)', border: '1px solid rgba(47,224,122,0.3)', padding: '5px 14px', borderRadius: 9999, fontWeight: 700, fontSize: 12 }}>
              STATUS: INFEED PORT READY
            </span>
          </div>

          <div className="tomorro-cockpit-body">
            {/* Left side: Realistic RVM deposit photo & overlay */}
            <div
              className="tomorro-cockpit-left"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=1200&q=85')` }}
            >
              <div className="tomorro-cockpit-overlay" />
              <div className="tomorro-cockpit-content">
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
                  AI SPECTRAL TELEMETRY FEED
                </span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 28, textTransform: 'uppercase', color: '#ffffff', margin: '0 0 10px', letterSpacing: -0.5 }}>
                  PET 500ml Clear Bottle Verified
                </h3>
                <p style={{ color: '#c2d7cb', fontSize: 13.5, lineHeight: 1.5, margin: '0 0 18px', maxWidth: 440 }}>
                  High-speed multi-angle cameras verify barcode registration and container geometry. Infrared sensors validate zero residual liquid.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ background: 'rgba(7,25,16,0.85)', border: '1px solid rgba(47,224,122,0.35)', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#ffffff' }}>
                    Dividend: +10 Green Points
                  </span>
                  <span style={{ background: 'rgba(7,25,16,0.85)', border: '1px solid rgba(47,224,122,0.35)', padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: 'var(--tomorro-fluo-green)' }}>
                    CO₂ Prevented: -65g
                  </span>
                </div>
              </div>
            </div>

            {/* Right side: Telemetry terminal */}
            <div className="tomorro-cockpit-right">
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#7a9686', display: 'block', marginBottom: 14 }}>
                  SENSOR STATUS HUD
                </span>
                <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: '#8da495' }}>Material Resin:</span>
                    <strong style={{ color: '#ffffff' }}>PET #01 Clear (100% Recyclable)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: '#8da495' }}>Optical Purity:</span>
                    <strong style={{ color: 'var(--tomorro-fluo-green)' }}>99.8% Food-Grade</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: '#8da495' }}>Compactor State:</span>
                    <strong style={{ color: '#ffffff' }}>Pneumatic Cycle Complete</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: '#8da495' }}>Ledger Sync:</span>
                    <strong style={{ color: '#cbf565' }}>MariaDB 3NF Atomic Commit</strong>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <Link href="/machines" className="btn-tomorro-lime" style={{ width: '100%', justifyContent: 'center' }}>
                  Deploy or Find Kiosk ↗
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -----------------------------------------------------------------
          SECTION 2: SPOTLIGHT "MEET ECO-VISION" (SUBMERGED RVM + DARK OVERLAY + BENTO MOSAIC)
          ----------------------------------------------------------------- */}
      <section className="tomorro-section-spotlight">
        {/* Submerged RVM Background Image */}
        <div className="tomorro-spotlight-bg" />
        {/* Dark High-Contrast Overlay */}
        <div className="tomorro-spotlight-overlay" />

        <div className="tomorro-spotlight-content">
          {/* 3D Realistic Camera Lens / AI Aperture */}
          <div className="tomorro-3d-lens-wrapper">
            <div className="tomorro-3d-lens">
              <div className="tomorro-3d-lens-pupil" />
            </div>
          </div>

          {/* Condensed Bold Headline */}
          <h2 className="tomorro-spotlight-headline">
            MEET <span className="text-highlight">ECO-VISION</span>,<br />
            THE INTELLIGENT EYE OF<br />
            CIRCULAR INFRASTRUCTURE
          </h2>

          <p className="tomorro-spotlight-sub">
            Engineered and manufactured by BravoForest. Our autonomous Reverse Vending Machines (RVM) fuse sub-second optical AI spectroscopy, 85% high-torque pneumatic compaction, and real-time cloud ESG ledgers to transform urban recycling into verified economic dividends.
          </p>

          {/* Telemetry Chips (NO DOTS) */}
          <div className="tomorro-spotlight-chips">
            <span className="tomorro-spotlight-chip">4K Optical Array</span>
            <span className="tomorro-spotlight-chip">0.3s Recognition Speed</span>
            <span className="tomorro-spotlight-chip">Zero Contamination Tolerance</span>
            <span className="tomorro-spotlight-chip">Multi-Material Auto Infeed</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <Link href="/machines" className="btn-tomorro-lime">
              Locate Nearest RVM ↗
            </Link>
            <a href="#features" className="btn-tomorro-dark-pill">
              Explore Hardware Architecture
            </a>
          </div>

          {/* Big & Small Bento Image Showcase: RVM Hardware & Enterprise Solution */}
          <div className="tomorro-spotlight-bento">
            {/* 1. BIG CARD (Ảnh To) */}
            <div
              className="tomorro-bento-hero"
              style={{ backgroundImage: `url('https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1600&q=85')` }}
            >
              <div className="tomorro-bento-hero-overlay" />
              <div className="tomorro-bento-hero-content">
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block' }}>
                  FLAGSHIP HARDWARE · BRAVOFOREST RVM X-SERIES
                </span>
                <h3>AUTONOMOUS CIRCULAR KIOSKS FOR URBAN HUBS</h3>
                <p>
                  Engineered for commercial plazas, university campuses, and transport terminals. Our heavy-duty internal electro-mechanical crushers compact up to 1,200 bottles per service cycle, cutting municipal collection trips and fleet carbon emissions by over 40%.
                </p>
                <div className="tomorro-bento-hero-chips">
                  <span className="tomorro-bento-hero-chip">1,200 Containers Storage</span>
                  <span className="tomorro-bento-hero-chip">85% Volume Compaction</span>
                  <span className="tomorro-bento-hero-chip">Tamper-Proof Weight Sensor</span>
                  <span className="tomorro-bento-hero-chip">Cellular 5G IoT Telemetry</span>
                </div>
              </div>
            </div>

            {/* 2. THREE SMALL CARDS (Ảnh Nhỏ) */}
            <div className="tomorro-bento-row">
              <div
                className="tomorro-bento-card"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=85')` }}
              >
                <div className="tomorro-bento-card-overlay" />
                <div className="tomorro-bento-card-content">
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--tomorro-fluo-green)' }}>
                    OPTICAL SUBSYSTEM
                  </span>
                  <h4>Sub-Second Optical Vision</h4>
                  <p>
                    Identifies resin polymers (PET, HDPE, Can) and flags residual liquid in under 0.4s to prevent downstream contamination.
                  </p>
                </div>
              </div>

              <div
                className="tomorro-bento-card"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=85')` }}
              >
                <div className="tomorro-bento-card-overlay" />
                <div className="tomorro-bento-card-content">
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--tomorro-fluo-green)' }}>
                    ENTERPRISE CLOUD
                  </span>
                  <h4>Auditable ESG Ledger</h4>
                  <p>
                    Real-time transactional logs feed directly into corporate sustainability reports with tamper-proof carbon offset verification.
                  </p>
                </div>
              </div>

              <div
                className="tomorro-bento-card"
                style={{ backgroundImage: `url('https://images.unsplash.com/photo-1591193686104-fddba4d0e4d8?auto=format&fit=crop&w=800&q=85')` }}
              >
                <div className="tomorro-bento-card-overlay" />
                <div className="tomorro-bento-card-content">
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--tomorro-fluo-green)' }}>
                    PNEUMATIC COMPACTOR
                  </span>
                  <h4>Internal Compactor Unit</h4>
                  <p>
                    Heavy-duty internal crusher reduces container volume by 85%, storing up to 1,200 bottles and cans before collection.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -----------------------------------------------------------------
          SECTION 3: PITCH BLACK METRICS & ARCHITECTURE
          ----------------------------------------------------------------- */}
      <section id="features" className="tomorro-section-black">
        {/* Big Numbers */}
        <div className="tomorro-black-metrics">
          <div className="tomorro-black-metric-item">
            <div className="tomorro-black-metric-num">53%</div>
            <div className="tomorro-black-metric-label">
              Drop in contamination rates compared to single-stream curbside bins.
            </div>
          </div>
          <div className="tomorro-black-metric-item">
            <div className="tomorro-black-metric-num" style={{ color: 'var(--tomorro-fluo-green)' }}>99.4%</div>
            <div className="tomorro-black-metric-label">
              Precision accuracy validating PET polymers and aluminium container barcodes.
            </div>
          </div>
          <div className="tomorro-black-metric-item">
            <div className="tomorro-black-metric-num" style={{ color: '#cbf565' }}>3.4M+</div>
            <div className="tomorro-black-metric-label">
              Post-consumer containers returned into closed-loop food-grade packaging.
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 40 }}>
          <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 22, color: '#ffffff', margin: '0 0 16px' }}>
            Precision automated sorting. Built for high-traffic urban density.
          </h3>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <Link href="/register" className="btn-tomorro-lime" style={{ padding: '10px 22px', fontSize: 13.5 }}>
              Create Account ↗
            </Link>
            <Link href="/rewards" className="btn-tomorro-dark-pill" style={{ padding: '10px 22px', fontSize: 13.5 }}>
              Browse Eco Catalog
            </Link>
          </div>
        </div>

        {/* Headline */}
        <h2 className="tomorro-black-headline">
          THE COMPLETE MATERIAL LIFECYCLE,<br />
          SUPERCHARGED BY <span className="text-highlight">AI</span>
        </h2>

        {/* Pill Tabs Selector (NO green dots at the beginning!) */}
        <div className="tomorro-pill-tabs">
          {[
            ['scan', '01. Infeed Optical Scan'],
            ['sort', '02. Multi-Spectral AI Sort'],
            ['wallet', '03. Instant Ledger Payout'],
            ['compact', '04. On-Site 85% Compaction']
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`tomorro-pill-tab ${activeTab === key ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Hardware Mock Window */}
        <div className="tomorro-black-mock">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#7a9686', letterSpacing: 1 }}>
              {currentTab.step} · BRAVOFOREST AUTONOMOUS KIOSK ENGINE
            </span>
            <span style={{ background: 'rgba(47,224,122,0.15)', color: 'var(--tomorro-fluo-green)', border: '1px solid rgba(47,224,122,0.3)', padding: '5px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 700 }}>
              {currentTab.status}
            </span>
          </div>

          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 30, textTransform: 'uppercase', margin: '0 0 12px', color: '#ffffff', letterSpacing: -0.5 }}>
            {currentTab.title}
          </h3>
          <p style={{ color: '#a2b8ab', fontSize: 15, lineHeight: 1.6, margin: '0 0 26px', maxWidth: 840 }}>
            {currentTab.desc}
          </p>

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', gap: 20 }}>
              <span style={{ color: 'var(--tomorro-fluo-green)', fontWeight: 700, fontSize: 14 }}>
                ✓ {currentTab.metric}
              </span>
              <span style={{ color: '#ffffff', fontWeight: 600, fontSize: 14 }}>
                ✳ {currentTab.pts}
              </span>
            </div>
            <Link href="/machines" style={{ color: 'var(--tomorro-neon-lime)', fontWeight: 800, fontSize: 13.5 }}>
              Locate Nearby Unit →
            </Link>
          </div>
        </div>
      </section>

      {/* -----------------------------------------------------------------
          SECTION 4: CRISP LIGHT OFF-WHITE ROLE GRID (HIGH CONTRAST SHIFT)
          ----------------------------------------------------------------- */}
      <section className="tomorro-section-light">
        <h2 className="tomorro-light-headline">
          ENGINEERED FOR EVERY SECTOR<br />
          OF THE CIRCULAR ECONOMY
        </h2>
        <p className="tomorro-light-sub">
          Explore how BravoForest bridges citizen convenience, retail customer loyalty, and verifiable industrial-grade material feedstock.
        </p>

        {/* 6 High-Res Photo Cards (3x2 Grid) */}
        <div className="tomorro-role-grid">
          {[
            {
              title: 'Conscious Citizens',
              desc: 'Transform everyday beverage containers into coffee perks, grocery vouchers, and clean mobility credits.',
              img: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=85'
            },
            {
              title: 'Campuses & Academies',
              desc: 'Foster circular habits through student sustainability leaderboards and zero-waste campus rewards.',
              img: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=85'
            },
            {
              title: 'Enterprises & Retail ESG',
              desc: 'Meet auditable Scope 3 emission reduction targets, sponsor green perks, and boost conscious foot traffic.',
              img: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85'
            },
            {
              title: 'Eco Residential Towers',
              desc: 'Modernize community lobbies with clean in-building recycling kiosks, cutting trash chute congestion.',
              img: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=85'
            },
            {
              title: 'Reprocessors & Converters',
              desc: 'Secure 99.4% pure food-grade rPET flakes directly at the source, eliminating 80% of secondary sorting.',
              img: 'https://images.unsplash.com/photo-1605600659873-d808a13e4d2a?auto=format&fit=crop&w=1200&q=85'
            },
            {
              title: 'Smart Cities & Fleet',
              desc: 'Real-time telemetry and predictive fullness alerts optimize collection routes, reducing truck emissions.',
              img: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1200&q=85'
            }
          ].map(card => (
            <div
              key={card.title}
              className="tomorro-role-card"
              style={{ backgroundImage: `url('${card.img}')` }}
            >
              <div className="tomorro-role-overlay">
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                </div>
                <div className="tomorro-role-arrow">›</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -----------------------------------------------------------------
          SECTION 5: STICKER BADGES & WARM TESTIMONIALS
          ----------------------------------------------------------------- */}
      <section className="tomorro-section-testimonials">
        {/* 3 Stacked Rounded Sticker Pills (NO green dots!) */}
        <div className="tomorro-sticker-stack">
          <div className="tomorro-sticker-pill sticker-mint">
            CIRCULAR COMMUNITY 🌿 🏙️
          </div>
          <div className="tomorro-sticker-pill sticker-lime">
            REAL CITIZEN EXPERIENCES
          </div>
          <div className="tomorro-sticker-pill sticker-mint">
            MORE AUTHENTIC THAN ANY AD ↓
          </div>
        </div>

        {/* 4 Testimonial Cards */}
        <div className="tomorro-testimonial-grid">
          {[
            {
              quote: 'Placing a BravoForest RVM in our building lobby motivated residents to bring their empties daily. The Highlands Coffee vouchers are an absolute favorite!',
              name: 'Sarah Jenkins',
              role: 'Property HOA President',
              company: 'Green Riverside Towers',
              impact: '-210 kg CO₂ Offset'
            },
            {
              quote: 'The AI camera recognition is instant—you drop a bottle, and the shutter swallows it immediately. No sorting mistakes, no queuing.',
              name: 'David Chen',
              role: 'Silver Recycler Member',
              company: 'Downtown Eco Commuter',
              impact: '480 Bottles Returned'
            },
            {
              quote: 'Partnering with BravoForest enabled our retail brand to reach thousands of environmentally conscious shoppers while driving verifiable ESG metrics.',
              name: 'Elena Rostova',
              role: 'Sustainability Director',
              company: 'Green Common Foods',
              impact: 'Verified Circular Partner'
            },
            {
              quote: 'The PET feedstock collected from these machines is exceptionally clean. Our recycling plant reduced pre-washing and sorting overhead by over 70%.',
              name: 'Marcus Vance',
              role: 'Operations Director',
              company: 'Circular Polymer Group',
              impact: '99.8% Material Purity'
            }
          ].map((item, idx) => (
            <div key={idx} className="tomorro-testimonial-card">
              <div>
                <span style={{ display: 'inline-block', background: '#eef8ee', color: '#166534', padding: '4px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700, marginBottom: 14 }}>
                  {item.impact}
                </span>
                <p className="tomorro-testimonial-quote">"{item.quote}"</p>
              </div>
              <div className="tomorro-testimonial-author">
                <div className="tomorro-testimonial-avatar">
                  {item.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: 13.5, color: '#071c12' }}>{item.name}</strong>
                  <small style={{ color: '#556c5e', fontSize: 12 }}>{item.role}</small>
                  <div style={{ color: '#15803d', fontSize: 11.5, fontWeight: 700, marginTop: 2 }}>{item.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -----------------------------------------------------------------
          SECTION 6: GRAND PANORAMIC CALL TO ACTION
          ----------------------------------------------------------------- */}
      <section className="tomorro-section-cta">
        <div
          className="tomorro-cta-box"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1511497584788-87676104235f?auto=format&fit=crop&w=1600&q=85')` }}
        >
          <div className="tomorro-cta-overlay" />
          <div className="tomorro-cta-content">
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 10 }}>
              JOIN THE ZERO-WASTE MOVEMENT
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(38px, 5.5vw, 68px)', fontWeight: 800, textTransform: 'uppercase', color: '#ffffff', lineHeight: 0.95, margin: '0 0 18px', letterSpacing: -0.5 }}>
              READY TO TURN EVERY BOTTLE<br />
              INTO REAL-WORLD IMPACT?
            </h2>
            <p style={{ color: '#cbe0d3', fontSize: 16.5, lineHeight: 1.6, margin: '0 auto 34px', maxWidth: 620 }}>
              Locate your nearest BravoForest Reverse Vending Machine or integrate smart closed-loop recycling kiosks across your enterprise today.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Link href="/machines" className="btn-tomorro-lime">
                Locate an RVM Kiosk ↗
              </Link>
              <Link href="/register" className="btn-tomorro-dark-pill">
                Create Free Member Account
              </Link>
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
              ? 'Create a free account and receive 50 bonus green points on your first deposit.'
              : 'Sign in to access your green wallet and monitor verified infeed sessions.'}
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
                  placeholder="alex.morgan@email.com"
                />
              </div>
              <div className="tomorro-field">
                <label>Phone Number</label>
                <input
                  className="tomorro-input"
                  name="phone"
                  type="tel"
                  placeholder="+1 (555) 019-2834"
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
          <div>✓ Automatic balance synchronization at all national RVM kiosks</div>
          <div>✓ Instant voucher redemptions with partner coffee and food brands</div>
          <div>✓ SSL encrypted data & immutable MariaDB accounting ledger</div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 3: DASHBOARD (UNIFIED IN ENGLISH)
   ========================================================================= */

function Dashboard() {
  const me = useApi<Row>('/auth/me');
  const sessions = useApi<unknown>('/sessions');
  const user = me.data;
  const ss = rowsFrom<Row>(sessions.data);

  const displaySessions = ss.length > 0 ? ss : [
    { session_id: 'S-10824', started_at: '2026-10-12T09:42:00Z', status: 'COMPLETED', points: 120, machine_name: 'Central Promenade RVM', material: '12 PET Bottles' },
    { session_id: 'S-10823', started_at: '2026-10-10T16:15:00Z', status: 'COMPLETED', points: 90, machine_name: 'Skyline Plaza RVM', material: '6 Aluminium Cans' },
    { session_id: 'S-10822', started_at: '2026-10-08T11:04:00Z', status: 'COMPLETED', points: 80, machine_name: 'Campus Eco Hub RVM', material: '8 PET Bottles' }
  ];

  const currentBalance = user?.wallet?.balance !== undefined ? Number(user.wallet.balance) : 2480;
  const memberName = val(user ?? {}, 'fullName', 'full_name') || 'Eco Citizen';

  return (
    <div className="tomorro-container">
      {/* Welcome Banner */}
      <div className="tomorro-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
              SILVER RECYCLER TIER · ACTIVE MEMBER
            </span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', letterSpacing: -0.5, color: '#ffffff' }}>
              Welcome back, {memberName}!
            </h1>
            <p style={{ color: '#a3baad', margin: 0, fontSize: 14.5 }}>
              Every bottle you return prevents marine pollution and accelerates clean closed-loop recycling.
            </p>
          </div>
          <Link href="/machines" className="btn-tomorro-lime" style={{ padding: '12px 24px', fontSize: 14 }}>
            Locate Infeed Station ↗
          </Link>
        </div>
      </div>

      {/* 4 Bento Metric Cards */}
      <div className="grid-4" style={{ marginBottom: 28, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>GREEN POINTS BALANCE</span>
            <span style={{ color: 'var(--tomorro-fluo-green)', fontSize: 16 }}>✳</span>
          </div>
          <strong className="tomorro-metric-val">{currentBalance.toLocaleString()} pts</strong>
          <span className="tomorro-metric-sub">↑ +320 pts this month</span>
        </div>

        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>BOTTLES RECYCLED</span>
            <span style={{ color: 'var(--tomorro-fluo-green)', fontSize: 16 }}>♻</span>
          </div>
          <strong className="tomorro-metric-val">128 units</strong>
          <span className="tomorro-metric-sub">↑ 16% over last month</span>
        </div>

        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>COMPLETED SESSIONS</span>
            <span style={{ color: 'var(--tomorro-fluo-green)', fontSize: 16 }}>↻</span>
          </div>
          <strong className="tomorro-metric-val">{displaySessions.length || 14} sessions</strong>
          <span className="tomorro-metric-sub">Active 4 consecutive weeks</span>
        </div>

        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>CO₂ OFFSET PREVENTED</span>
            <span style={{ color: 'var(--tomorro-fluo-green)', fontSize: 16 }}>♧</span>
          </div>
          <strong className="tomorro-metric-val">8.4 kg</strong>
          <span className="tomorro-metric-sub">Equivalent to planting 3 trees</span>
        </div>
      </div>

      {/* 2-Column Bento Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
        {/* Left: Trend & Activity */}
        <div style={{ display: 'grid', gap: 24 }}>
          {/* Recycling Chart */}
          <div className="tomorro-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#739981' }}>WEEKLY RECYCLING CADENCE</span>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', margin: '4px 0 0', color: '#ffffff' }}>Daily Activity Velocity</h2>
              </div>
              <span className="pill pill-green">+14.2% vs previous period</span>
            </div>
            <div className="chart" style={{ background: 'transparent' }}>
              {[45, 60, 50, 75, 55, 90, 80, 100, 65, 85, 70, 95].map((v, i) => (
                <span key={i} style={{ height: `${v}%` }} title={`Day ${i + 1}: ${v} points`} />
              ))}
            </div>
          </div>

          {/* Activity Table */}
          <div className="tomorro-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', margin: 0, color: '#ffffff' }}>Recent Infeed Sessions</h2>
              <Link href="/history" style={{ fontSize: 13, fontWeight: 700, color: 'var(--tomorro-fluo-green)' }}>
                View All History →
              </Link>
            </div>
            <div className="tomorro-table-wrap">
              <table className="tomorro-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Station Kiosk</th>
                    <th>Material Type</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Dividend</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySessions.slice(0, 4).map((r, i) => (
                    <tr key={i}>
                      <td>{fmtDate(val(r, 'started_at', 'startedAt'))}</td>
                      <td>{val(r, 'machine_name') || `Station #${val(r, 'session_id', 'sessionId')}`}</td>
                      <td>
                        <span className="pill" style={{ background: 'rgba(255,255,255,0.05)', color: '#b5c7bc', fontSize: 11 }}>
                          {val(r, 'material') || 'PET Clear Resin'}
                        </span>
                      </td>
                      <td><Pill tone="green">Verified</Pill></td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--tomorro-fluo-green)' }}>
                        +{val(r, 'points') || 10} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Tier Progress & Quick Redeem */}
        <div style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
          {/* Membership Tier Progress */}
          <div className="tomorro-card" style={{ background: 'linear-gradient(145deg, #0b2518 0%, #05150d 100%)', borderColor: 'rgba(47,224,122,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--tomorro-fluo-green)' }}>MEMBER TIER STATUS</span>
              <span className="pill pill-green">Silver Tier</span>
            </div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 32, textTransform: 'uppercase', margin: '10px 0 6px', color: '#ffffff' }}>
              2,480 / 3,000 Points
            </h3>
            <p style={{ color: '#9cb1a4', fontSize: 13, margin: '0 0 16px' }}>
              Only <strong>520 points</strong> until reaching <strong>Gold Tier</strong> with 1.2x dividend multiplier!
            </p>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ width: '82%', height: '100%', background: 'linear-gradient(90deg, #2fe07a, #cbf565)', borderRadius: 9999 }} />
            </div>
          </div>

          {/* Quick Redeem */}
          <div className="tomorro-card">
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', margin: '0 0 16px', color: '#ffffff' }}>Featured Partner Vouchers</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                ['☕', 'Highlands Coffee', '$2.50 Drink Voucher', 800],
                ['🌱', 'Green Common', '15% Off Organic Plant Meals', 600],
                ['🚲', 'City Smart Bike', '60-Minute Urban Ride Pass', 500]
              ].map(([icon, brand, name, pts]) => (
                <div key={brand} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{icon}</span>
                    <div>
                      <strong style={{ display: 'block', fontSize: 13.5, color: '#ffffff' }}>{brand}</strong>
                      <small style={{ color: '#8da295' }}>{name}</small>
                    </div>
                  </div>
                  <Link href="/rewards" className="btn-tomorro-lime" style={{ padding: '6px 14px', fontSize: 12 }}>
                    {pts} pts ↗
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 4: REWARDS (UNIFIED IN ENGLISH)
   ========================================================================= */

interface RewardItem {
  id: number;
  brand: string;
  category: 'coffee' | 'food' | 'bike' | 'eco';
  icon: string;
  title: string;
  description: string;
  pointsCost: number;
  stockLeft: number;
  popular?: boolean;
}

const defaultRewards: RewardItem[] = [
  { id: 101, brand: 'Highlands Coffee', category: 'coffee', icon: '☕', title: 'Beverage Perk Voucher', description: 'Redeemable on any medium or large craft coffee at nationwide branches.', pointsCost: 800, stockLeft: 42, popular: true },
  { id: 102, brand: 'Green Common', category: 'food', icon: '🌱', title: '15% Off Plant-Based Meals', description: 'Valid on fresh plant-based dishes and organic market groceries.', pointsCost: 600, stockLeft: 88 },
  { id: 103, brand: 'Ocean Refill Co.', category: 'eco', icon: '🛍', title: 'Recycled Stainless Tumbler', description: 'Double-walled 500ml vacuum insulated bottle made from certified recycled steel.', pointsCost: 1200, stockLeft: 15, popular: true },
  { id: 104, brand: 'City Smart Bike', category: 'bike', icon: '🚲', title: '60-Minute Urban Ride Code', description: 'Zero-emission electric city transport across central mobility corridors.', pointsCost: 500, stockLeft: 120 },
  { id: 105, brand: 'Organic Farm Kitchen', category: 'food', icon: '🥗', title: '$5.00 Farm-to-Table Voucher', description: 'Sustainable seasonal dining powered by regenerative agriculture.', pointsCost: 1500, stockLeft: 20 },
  { id: 106, brand: 'Circular Canvas', category: 'eco', icon: '♻', title: 'Recycled Organic Tote Bag', description: 'Heavy-duty organic cotton tote bag engineered for thousands of reusable cycles.', pointsCost: 700, stockLeft: 64 },
  { id: 107, brand: 'The Roastery House', category: 'coffee', icon: '🧋', title: 'Craft Cold Brew Voucher', description: 'Direct-trade cold brew and single-origin pour-overs.', pointsCost: 550, stockLeft: 95 },
  { id: 108, brand: 'Green Metro EV', category: 'bike', icon: '⚡', title: 'Clean Electric Shuttle Ride', description: '100% clean electric city mobility with zero tailpipe emissions.', pointsCost: 650, stockLeft: 70 }
];

function Rewards() {
  const result = useApi<unknown>('/vouchers');
  const rows = rowsFrom<Row>(result.data);
  const [pending, setPending] = useState<number>();
  const [selectedReward, setSelectedReward] = useState<RewardItem | null>(null);
  const [modalSuccess, setModalSuccess] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');

  const catalog: RewardItem[] = useMemo(() => {
    if (rows.length > 0) {
      return rows.map((r, i) => ({
        id: Number(val(r, 'voucher_id', 'id') || i + 1),
        brand: String(val(r, 'partner_name', 'partnerName') || 'BravoForest Partner'),
        category: 'eco' as const,
        icon: '✳',
        title: String(val(r, 'title') || 'Eco Reward Voucher'),
        description: String(val(r, 'description') || val(r, 'terms') || 'Valid at certified ecological partner network.'),
        pointsCost: Number(val(r, 'points_cost', 'pointsCost') || 500),
        stockLeft: 50
      }));
    }
    return defaultRewards;
  }, [rows]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter(item => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory;
      const matchQuery = !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.brand.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [catalog, activeCategory, searchQuery]);

  async function handleRedeem(reward: RewardItem) {
    setPending(reward.id);
    setMessage('');
    try {
      if (rows.length > 0) {
        await apiPost<Row>('/redemptions', {
          voucherId: reward.id,
          idempotencyKey: crypto.randomUUID()
        });
        result.refresh();
      }
      setSelectedReward(reward);
      setModalSuccess(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to redeem reward.');
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="tomorro-container">
      {/* Banner */}
      <div className="tomorro-banner">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
              SUSTAINABLE PARTNER ECOSYSTEM
            </span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', letterSpacing: -0.5, color: '#ffffff' }}>
              Turn Empty Bottles Into Daily Perks
            </h1>
            <p style={{ color: '#a1b7a9', margin: 0, fontSize: 14.5, maxWidth: 620 }}>
              Convert the green points you earn from RVM container returns into craft coffee, healthy dining, and clean urban transit.
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px 24px', borderRadius: 20, border: '1px solid rgba(47,224,122,0.25)', textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: '#8da295', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>YOUR AVAILABLE BALANCE</span>
            <strong style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 28, color: 'var(--tomorro-fluo-green)', letterSpacing: -0.5 }}>
              2,480 <span style={{ fontSize: 14, fontWeight: 500 }}>pts</span>
            </strong>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['all', 'All Perks'],
            ['coffee', '☕ Coffee & Drinks'],
            ['food', '🌱 Sustainable Food'],
            ['bike', '🚲 Clean Mobility'],
            ['eco', '🛍 Reusable Goods']
          ].map(([cat, title]) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`button ${activeCategory === cat ? 'btn-tomorro-lime' : 'btn-tomorro-dark-pill'}`}
              style={{ padding: '8px 18px', fontSize: 13 }}
            >
              {title}
            </button>
          ))}
        </div>

        <div style={{ minWidth: 260 }}>
          <input
            type="text"
            className="tomorro-input"
            placeholder="⌕  Search perks, brands..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ borderRadius: 9999, padding: '10px 18px', fontSize: 13 }}
          />
        </div>
      </div>

      {message && (
        <div className="tomorro-card" role="status" style={{ marginBottom: 20, borderColor: '#f87171', color: '#fca5a5' }}>
          {message}
        </div>
      )}

      {/* Rewards Grid */}
      <ApiMessage loading={result.loading} error={result.error} empty={filteredCatalog.length === 0}>
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {filteredCatalog.map(item => (
            <div key={item.id} className="tomorro-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', fontSize: 24 }}>
                    {item.icon}
                  </div>
                  <span className="pill pill-green" style={{ fontSize: 10.5 }}>
                    {item.popular ? '★ Most Popular' : `${item.stockLeft} Remaining`}
                  </span>
                </div>

                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a9e86', display: 'block', marginBottom: 4 }}>
                  {item.brand}
                </span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', color: '#ffffff', margin: '0 0 8px' }}>{item.title}</h3>
                <p style={{ color: '#9db4a6', fontSize: 13.5, lineHeight: 1.5, marginBottom: 18 }}>{item.description}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 16, color: 'var(--tomorro-fluo-green)' }}>
                  <span>✳</span> {item.pointsCost.toLocaleString()} <small style={{ fontSize: 12, fontWeight: 500, color: '#7a9183' }}>pts</small>
                </div>
                <button
                  disabled={pending === item.id}
                  className="btn-tomorro-lime"
                  style={{ padding: '8px 18px', fontSize: 12.5 }}
                  onClick={() => handleRedeem(item)}
                >
                  {pending === item.id ? 'Claiming…' : 'Redeem Perk ↗'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </ApiMessage>

      {/* Redemption Success Modal */}
      {modalSuccess && selectedReward && (
        <div className="modal-overlay" onClick={() => setModalSuccess(false)}>
          <div className="tomorro-auth-card" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(47,224,122,0.15)', border: '1px solid var(--tomorro-fluo-green)', display: 'grid', placeItems: 'center', fontSize: 32, margin: '0 auto 14px' }}>
                {selectedReward.icon}
              </div>
              <span className="pill pill-green" style={{ marginBottom: 8 }}>REDEEMED SUCCESSFULLY</span>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, textTransform: 'uppercase', margin: '6px 0', letterSpacing: -0.5, color: '#ffffff' }}>
                Congratulations on Your Reward!
              </h2>
              <p style={{ color: '#9cb1a4', fontSize: 13.5, margin: 0 }}>
                You redeemed {selectedReward.pointsCost} points for {selectedReward.title}.
              </p>
            </div>

            <div style={{ background: '#05110c', padding: 20, borderRadius: 16, border: '1px dashed rgba(47,224,122,0.4)', textAlign: 'center', marginBottom: 20 }}>
              <small style={{ color: '#7a9e86', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, fontSize: 10 }}>YOUR VOUCHER REDEMPTION CODE</small>
              <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 24, letterSpacing: 3, color: 'var(--tomorro-fluo-green)', margin: '6px 0 8px' }}>
                BF-{selectedReward.brand.slice(0, 3).toUpperCase()}-{(Math.random() * 10000 | 0).toString().padStart(4, '0')}
              </div>
              <small style={{ color: '#688472', fontSize: 12 }}>Valid for 30 days · Present at partner checkout counter</small>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <button
                className="btn-tomorro-lime"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  alert('Voucher code copied to clipboard!');
                  setModalSuccess(false);
                }}
              >
                Copy Voucher Code & Close
              </button>
              <Link
                href="/vouchers"
                className="btn-tomorro-dark-pill"
                style={{ width: '100%', fontSize: 13, textAlign: 'center', justifyContent: 'center' }}
                onClick={() => setModalSuccess(false)}
              >
                View in My Voucher Wallet →
              </Link>
            </div>
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

  const balance = me.data?.wallet?.balance !== undefined ? Number(me.data.wallet.balance) : 2480;
  const totalIn = me.data?.wallet?.total_in !== undefined ? Number(me.data.wallet.total_in) : 3120;
  const totalOut = me.data?.wallet?.total_out !== undefined ? Math.abs(Number(me.data.wallet.total_out)) : 640;

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          IMMUTABLE MARIADB LEDGER
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          Green Points Wallet & Audit Ledger
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Each balance accrual is mathematically verified per infeed container transaction at RVM stations.
        </p>
      </div>

      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 28 }}>
        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>AVAILABLE BALANCE</span>
            <span style={{ color: 'var(--tomorro-fluo-green)' }}>✳</span>
          </div>
          <strong className="tomorro-metric-val">{balance.toLocaleString()} pts</strong>
          <span className="tomorro-metric-sub">Ready for redemption</span>
        </div>

        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>CUMULATIVE EARNED</span>
            <span style={{ color: 'var(--tomorro-fluo-green)' }}>↗</span>
          </div>
          <strong className="tomorro-metric-val">+{totalIn.toLocaleString()} pts</strong>
          <span className="tomorro-metric-sub">From verified infeed sessions</span>
        </div>

        <div className="tomorro-metric">
          <div className="tomorro-metric-top">
            <span>REDEEMED FOR VOUCHERS</span>
            <span style={{ color: '#f59e0b' }}>↘</span>
          </div>
          <strong className="tomorro-metric-val">-{totalOut.toLocaleString()} pts</strong>
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
          Complete record of verified beverage container returns processed by our AI optical cameras.
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

  return (
    <div className="tomorro-container">
      <div className="tomorro-banner">
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--tomorro-fluo-green)', display: 'block', marginBottom: 6 }}>
          NATIONWIDE RECOVERY INFRASTRUCTURE
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', textTransform: 'uppercase', margin: '4px 0 8px', color: '#ffffff' }}>
          Find an RVM Station Near You
        </h1>
        <p style={{ color: '#9db4a6', margin: 0, fontSize: 14 }}>
          Real-time interactive geospatial directory and live infeed operational status.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 }}>
        <div className="tomorro-card" style={{ padding: 12 }}>
          <ApiMessage loading={map.loading} error={map.error} empty={!rowsFrom(map.data).length}>
            <RvmMap />
          </ApiMessage>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <ApiMessage loading={locations.loading} error={locations.error} empty={!rows.length}>
            {rows.map((r, i) => (
              <div key={val(r, 'id', 'location_id') || i} className="tomorro-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Pill tone={val(r, 'isActive', 'is_active') === false ? 'red' : 'green'}>
                      {val(r, 'isActive', 'is_active') === false ? 'Maintenance' : 'Infeed Active'}
                    </Pill>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', margin: '10px 0 4px', color: '#ffffff' }}>
                      {val(r, 'name')}
                    </h3>
                    <small style={{ color: '#8da295' }}>
                      {[val(r, 'address'), val(r, 'ward'), val(r, 'district'), val(r, 'city')].filter(Boolean).join(', ')}
                    </small>
                  </div>
                  <strong style={{ color: 'var(--tomorro-fluo-green)', fontFamily: 'var(--font-display)', fontSize: 22 }}>
                    {Number(val(r, 'machine_count', 'machineCount') || 1)} Kiosks
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
          Active discount codes ready for presentation at partner coffee and lifestyle stores.
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
          Pair your live container deposit session to receive verified green points directly into your wallet.
        </p>
      </div>

      <div className="tomorro-card" style={{ maxWidth: 500 }}>
        <form onSubmit={submit}>
          <div className="tomorro-field">
            <label>6-8 Character QR / Pairing Code</label>
            <input
              className="tomorro-input"
              name="qrToken"
              placeholder="e.g. BF-9482-TX"
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
