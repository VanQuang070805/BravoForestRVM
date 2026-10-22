'use client';

import { useEffect, useState, useMemo, useRef, type FormEvent, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { MotionConfig, motion, AnimatePresence } from 'motion/react';
import QRCodeGenerator from 'qrcode';
import { apiGet, apiPatch, apiPost, clearAccessToken, markSignedOut, setAccessToken, ApiError } from '../lib/api';
import { useApi, rowsFrom } from '../lib/use-api';
import Stepper, { Step } from './react-bits/Stepper';
import GlideSelect from './react-bits/GlideSelect';
const ScrollExpand = dynamic(() => import('./react-bits/ScrollExpand'));
const LogoLoop = dynamic(() => import('./react-bits/LogoLoop'));
const CircularGallery = dynamic(() => import('./react-bits/CircularGallery'));
const AnimatedContent = dynamic<any>(() => import('./react-bits/AnimatedContent'));
const CodeSlots = dynamic(() => import('./react-bits/CodeSlots'));
const LightRays = dynamic(() => import('./react-bits/LightRays'));
const ElectricLogo = dynamic(() => import('./react-bits/ElectricLogo'));
const FadeContent = dynamic(() => import('./react-bits/FadeContent'));
const MaskedHeading = dynamic(() => import('./react-bits/MaskedHeading'));
const AccordionGallery = dynamic(() => import('./react-bits/AccordionGallery'));
const SpecularButton = dynamic(() => import('./react-bits/SpecularButton'));
const SpotlightCard = dynamic(() => import('./react-bits/SpotlightCard'));
const PixelCard = dynamic(() => import('./react-bits/PixelCard'));
const RvmMap = dynamic(() => import('./rvm-map').then((module) => module.RvmMap), { ssr: false });
const CustomerQrScanner = dynamic(() => import('./CustomerQrScanner').then((module) => module.CustomerQrScanner), { ssr: false });
const CustomerCashoutPanel = dynamic(() => import('./CustomerCashoutPanel').then((module) => module.CustomerCashoutPanel));
const PENDING_RVM_SESSION_KEY = 'bravoforest-pending-rvm-session';
import {
  ArrowRight,
  ArrowUpRight,
  QrCode,
  Wallet as WalletIcon,
  MapPin,
  History as HistoryIcon,
  Gift,
  User as UserIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X as XIcon,
  Menu as MenuIcon,
  Search,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Phone,
  Landmark,
  Sparkles,
  CheckCircle2,
  Scan,
  Zap,
  Recycle,
  Layers,
  ShieldCheck
} from 'lucide-react';

type Row = Record<string, any>;

function LazyOnView({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '320px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={className} style={style}>{visible ? children : null}</div>;
}

interface RewardItem {
  id: number;
  partnerId: number;
  category: string;
  title: string;
  description: string;
  pointsCost: number;
  fulfillmentType: string;
}

const navLinks = [
  { label: 'Trang chủ', path: '' },
  { label: 'Quà tặng', path: 'rewards' },
  { label: 'Tìm máy', path: 'machines' }
];

const sectionReveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.14 },
  transition: { duration: 0.52, ease: 'easeOut' as const }
};

const heroGroup = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } }
};

const heroItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' as const } }
};

const val = (o: Row | undefined | null, ...keys: string[]) => {
  for (const k of keys) {
    if (o?.[k] !== undefined && o[k] !== null) return o[k];
  }
  return '';
};

const fmtDate = (v: any) =>
  v ? new Date(v).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const fmtNum = (v: number, decimals = 0) =>
  new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(v);

const normalizeSearch = (value: unknown) => String(value ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd');

function ApiMessage({
  loading,
  error,
  empty,
  emptyText = 'Chưa có dữ liệu trong mục này.',
  children
}: {
  loading: boolean;
  error?: string;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div
        className="rvm-cell-dark"
        role="status"
        style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-on-dark-muted)' }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <div className="w-5 h-5 border-2 border-[#15803D] border-t-transparent animate-spin" />
          <span className="font-mono text-xs uppercase tracking-widest text-[#15803D] font-bold">
            Đang tải dữ liệu…
          </span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="rvm-cell-dark"
        role="alert"
        style={{
          padding: '24px',
          borderLeft: '2px solid var(--brick-dark)',
          color: 'var(--text-on-dark)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--brick-dark)', marginBottom: 6 }}>
          <AlertTriangle size={18} />
          <strong className="font-mono text-xs uppercase tracking-wider">Không thể tải dữ liệu</strong>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-on-dark-muted)' }}>{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div
        className="rvm-cell-dark"
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--text-on-dark-muted)',
          display: 'grid',
          placeItems: 'center',
          gap: 12
        }}
      >
        <p className="font-ui text-sm" style={{ margin: 0 }}>{emptyText}</p>
      </div>
    );
  }
  return <>{children}</>;
}

/* =========================================================================
   3.1 NAVBAR (64PX, LIGHT BOTANICAL 3-CELL ARCHITECTURAL GRID)
   ========================================================================= */

function UnifiedNavbar({
  user,
  balance,
  logout,
  openScanner
}: {
  user?: Row;
  balance?: number;
  logout: () => void;
  openScanner?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = pathname?.replace(/^\//, '') || '';
  const isLanding = pathname === '/' || pathname === '';
  const [showNav, setShowNav] = useState(!isLanding);
  const [userDropdown, setUserDropdown] = useState(false);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleUserMouseEnter = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setUserDropdown(true);
  };

  const handleUserMouseLeave = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    dropdownTimeoutRef.current = setTimeout(() => {
      setUserDropdown(false);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isLanding) {
      setShowNav(true);
      return;
    }
    const handleScroll = () => {
      // Reveal header bar once user scrolls completely past the initial hero expansion
      const hero = document.getElementById('hero');
      const threshold = hero ? Math.max(hero.offsetTop - 80, 800) : (window.innerHeight * 1.5);
      setShowNav(window.scrollY >= threshold);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLanding]);

  const isLinkActive = (path: string) => {
    if (path === '') return currentPath === '' || currentPath === 'home';
    return currentPath === path || currentPath.startsWith(path + '/');
  };

  return (
    <header
      className="customer-floating-navbar-container"
      style={{
        position: 'fixed',
        top: 14,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: '0 16px',
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
        pointerEvents: 'none',
        opacity: showNav ? 1 : 0,
        transform: showNav ? 'translateY(0)' : 'translateY(-24px)',
        transition: 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <nav
        style={{
          pointerEvents: showNav ? 'auto' : 'none',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(17, 42, 29, 0.12)',
          borderRadius: 9999,
          padding: '7px 8px 7px 16px',
          boxShadow: '0 10px 32px -4px rgba(17, 42, 29, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
          boxSizing: 'border-box'
        }}
      >
        {/* Brand Logo */}
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            flexShrink: 0
          }}
        >
          <img
            src="/icon.png"
            alt="BravoForest"
            width={26}
            height={26}
            style={{ display: 'block', width: 26, height: 26, objectFit: 'contain' }}
          />
          <strong
            style={{
              fontSize: 14.5,
              fontWeight: 800,
              color: '#112A1D',
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap'
            }}
          >
            BravoForest
          </strong>
        </Link>

        {/* Desktop Nav Links: Chỉ giữ Tìm RVM và Quà tặng (bỏ Thành viên) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          <Link
            href="/machines"
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: 'none',
              color: isLinkActive('machines') ? '#15803d' : '#112A1D',
              background: isLinkActive('machines') ? 'rgba(21, 128, 61, 0.08)' : 'transparent',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            Tìm RVM
          </Link>
          <Link
            href="/rewards"
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: 'none',
              color: isLinkActive('rewards') ? '#15803d' : '#112A1D',
              background: isLinkActive('rewards') ? 'rgba(21, 128, 61, 0.08)' : 'transparent',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            Quà tặng
          </Link>
        </div>

        {/* Right Action Cluster: Quét QR máy RVM, User icon với Dropdown hover, Đăng xuất / Đăng nhập */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {/* Nút Quét QR - Chỉ hiển thị icon */}
          {user && <SpecularButton
            size="sm"
            radius={9999}
            tint="#86efac"
            tintOpacity={0.25}
            textColor="#ffffff"
            style={{
              background: '#15803d',
              color: '#ffffff',
              width: 36,
              height: 36,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: '1px solid rgba(134, 239, 172, 0.4)',
              boxShadow: '0 4px 14px rgba(21, 128, 61, 0.28)'
            }}
            onClick={openScanner}
            aria-label="Quét QR đăng nhập máy RVM"
            title="Quét QR đăng nhập máy RVM"
          >
            <Scan size={18} />
          </SpecularButton>}

          {user ? (
            <>
              {/* User Icon Container with Hover Dropdown */}
              <div
                style={{ position: 'relative' }}
                onMouseEnter={handleUserMouseEnter}
                onMouseLeave={handleUserMouseLeave}
              >
                <Link
                  href="/profile"
                  title="Tài khoản cá nhân"
                  aria-label="Tài khoản cá nhân"
                  onClick={() => setUserDropdown(false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: 9999,
                    color: userDropdown || isLinkActive('profile') ? '#ffffff' : '#15803d',
                    background: userDropdown || isLinkActive('profile') ? '#15803d' : 'rgba(21, 128, 61, 0.1)',
                    border: '1px solid rgba(21, 128, 61, 0.3)',
                    textDecoration: 'none',
                    transition: 'all 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <UserIcon size={16} />
                </Link>

                {/* Floating Dropdown on Hover with Seamless Hit-Area Bridge */}
                {userDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: -10,
                      paddingTop: 8,
                      zIndex: 1000
                    }}
                    onMouseEnter={handleUserMouseEnter}
                    onMouseLeave={handleUserMouseLeave}
                  >
                    <div
                      style={{
                        minWidth: 220,
                        background: '#FFFFFF',
                        borderRadius: 18,
                        padding: '8px',
                        boxShadow: '0 20px 48px -8px rgba(17, 42, 29, 0.2), 0 4px 12px rgba(0, 0, 0, 0.06)',
                        border: '1px solid rgba(17, 42, 29, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3
                      }}
                    >
                      <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid rgba(17, 42, 29, 0.08)', marginBottom: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          TÀI KHOẢN THÀNH VIÊN
                        </span>
                        <strong style={{ display: 'block', fontSize: 13, color: '#112A1D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {val(user, 'fullName', 'full_name') || val(user, 'email') || 'Thành viên Bravo'}
                        </strong>
                      </div>

                      <Link
                        href="/wallet"
                        onClick={() => setUserDropdown(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          color: isLinkActive('wallet') ? '#15803d' : '#112A1D',
                          background: isLinkActive('wallet') ? 'rgba(21, 128, 61, 0.08)' : 'transparent',
                          textDecoration: 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(21, 128, 61, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isLinkActive('wallet') ? 'rgba(21, 128, 61, 0.08)' : 'transparent')}
                      >
                        <WalletIcon size={16} style={{ color: '#15803d' }} />
                        <span>Ví của tôi</span>
                      </Link>

                      <Link
                        href="/profile"
                        onClick={() => setUserDropdown(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          color: isLinkActive('profile') ? '#15803d' : '#112A1D',
                          background: isLinkActive('profile') ? 'rgba(21, 128, 61, 0.08)' : 'transparent',
                          textDecoration: 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(21, 128, 61, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isLinkActive('profile') ? 'rgba(21, 128, 61, 0.08)' : 'transparent')}
                      >
                        <UserIcon size={16} style={{ color: '#15803d' }} />
                        <span>Thông tin cá nhân</span>
                      </Link>

                      <Link
                        href="/history"
                        onClick={() => setUserDropdown(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          color: isLinkActive('history') ? '#15803d' : '#112A1D',
                          background: isLinkActive('history') ? 'rgba(21, 128, 61, 0.08)' : 'transparent',
                          textDecoration: 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(21, 128, 61, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isLinkActive('history') ? 'rgba(21, 128, 61, 0.08)' : 'transparent')}
                      >
                        <HistoryIcon size={16} style={{ color: '#15803d' }} />
                        <span>Lịch sử thu hồi</span>
                      </Link>

                      <Link
                        href="/vouchers"
                        onClick={() => setUserDropdown(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          color: isLinkActive('vouchers') ? '#15803d' : '#112A1D',
                          background: isLinkActive('vouchers') ? 'rgba(21, 128, 61, 0.08)' : 'transparent',
                          textDecoration: 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(21, 128, 61, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isLinkActive('vouchers') ? 'rgba(21, 128, 61, 0.08)' : 'transparent')}
                      >
                        <Gift size={16} style={{ color: '#15803d' }} />
                        <span>Kho voucher</span>
                      </Link>

                      <div style={{ height: 1, background: 'rgba(17, 42, 29, 0.08)', margin: '4px 0' }} />

                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdown(false);
                          logout();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          borderRadius: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#dc2626',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <LogOut size={16} />
                        <span>Đăng xuất</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Nút Đăng nhập - Phong cách nút Tìm máy RVM ở Hero */
            <SpecularButton
              size="sm"
              radius={9999}
              tint="#86efac"
              tintOpacity={0.25}
              textColor="#ffffff"
              style={{
                background: '#15803d',
                color: '#ffffff',
                fontWeight: 800,
                padding: '7px 16px',
                fontSize: 12.5,
                cursor: 'pointer',
                border: '1px solid rgba(134, 239, 172, 0.4)',
                boxShadow: '0 4px 14px rgba(21, 128, 61, 0.28)'
              }}
              onClick={() => router.push('/login')}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <UserIcon size={14} />
                <span>Đăng nhập</span>
              </span>
            </SpecularButton>
          )}
        </div>
      </nav>
    </header>
  );
}


/* =========================================================================
   3.12 FOOTER (LIGHT BOTANICAL ARCHITECTURE + WATERMARK)
   ========================================================================= */

function UnifiedFooter() {
  return (
    <footer className="customer-footer">
      <div className="customer-footer-inner">
        <div className="customer-footer-brand">
          <Link href="/" className="customer-brand" aria-label="BravoForest, về trang chủ">
            <span className="customer-brand-mark" aria-hidden="true">
              <img src="/icon.png" alt="BravoForest" width={28} height={28} />
            </span>
            <span className="customer-brand-copy">
              <strong>BravoForest</strong>
              <small>Thu gom và tái chế bao bì</small>
            </span>
          </Link>
          <p>BravoForest thu gom chai nhựa nước uống tại trạm RVM.</p>
        </div>

        <div className="customer-footer-column">
          <strong>Khám phá</strong>
          <Link href="/#steps">Cách hoạt động</Link>
          <Link href="/rewards">Quà tặng</Link>
          <Link href="/machines">Tìm trạm RVM</Link>
        </div>

        <div className="customer-footer-column">
          <strong>Tài khoản</strong>
          <Link href="/wallet">Ví điểm</Link>
          <Link href="/history">Lịch sử thu hồi</Link>
          <Link href="/profile">Hồ sơ thành viên</Link>
        </div>

        <div className="customer-footer-note">
          <p>Tìm trạm RVM, gửi bao bì và theo dõi điểm trong tài khoản.</p>
          <Link href="/machines" className="customer-text-link">Tìm điểm gần bạn <ArrowRight size={15} /></Link>
        </div>
      </div>
      <div className="customer-footer-bottom">
        <span>© {new Date().getFullYear()} BravoForest</span>
        <span>Thu gom bao bì · Tích lũy điểm · Đổi quà xanh</span>
        <span className="customer-photo-sources">
          Nguồn ảnh tư liệu & nhiếp ảnh: <a href="https://commons.wikimedia.org/wiki/File:Closeup_of_Reverse_Vending_Machine_for_Victoria's_Container_Deposit_Scheme_in_Sunshine.jpg" target="_blank" rel="noreferrer">Sgroey</a>,{' '}
          <a href="https://commons.wikimedia.org/wiki/File:NSW_Return_and_Earn_scheme_automatic_recycling_sorting_centre.jpg" target="_blank" rel="noreferrer">Radiotrefoil</a>,{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Cans_recycling.jpg" target="_blank" rel="noreferrer">Radulf del Maresme</a>,{' '}
          <a href="https://unsplash.com" target="_blank" rel="noreferrer">Unsplash Creators</a>
        </span>
      </div>
    </footer>
  );
}
/* =========================================================================
   CUSTOMER SHELL COMPONENT
   ========================================================================= */

export function CustomerShell({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Row>();
  const [balance, setBalance] = useState<number>();
  const [scannerOpen, setScannerOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const openQrScanner = () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setScannerOpen(true);
  };

  useEffect(() => {
    const handleOpenScanner = () => openQrScanner();
    window.addEventListener('bravoforest:open-qr-scanner', handleOpenScanner);
    return () => window.removeEventListener('bravoforest:open-qr-scanner', handleOpenScanner);
  }, [user, router]);

  useEffect(() => {
    let active = true;
    const refreshProfile = () => {
      apiGet<Row>('/auth/me')
        .then((data) => {
          if (!active) return;
          if (String(val(data, 'role', 'role_name')).toUpperCase() !== 'CUSTOMER') {
            clearAccessToken();
            markSignedOut();
            setUser(undefined);
            setBalance(undefined);
            return;
          }
          setUser(data);
          const b = data?.wallet?.balance === undefined ? undefined : Number(data.wallet.balance);
          setBalance(b);
        })
        .catch((error) => {
          if (!active) return;
          if (error instanceof ApiError && error.status === 403) {
            clearAccessToken();
            markSignedOut();
          }
          setUser(undefined);
          setBalance(undefined);
        });
    };
    refreshProfile();
    window.addEventListener('bravoforest:wallet-updated', refreshProfile);

    return () => {
      active = false;
      window.removeEventListener('bravoforest:wallet-updated', refreshProfile);
    };
  }, [pathname]);

  const currentUserId = String(val(user, 'id', 'user_id') ?? '');
  useEffect(() => {
    if (!currentUserId) return;
    let stopped = false;
    let checking = false;
    const refreshCompletedDeposit = async () => {
      if (checking) return;
      checking = true;
      try {
        const pending = JSON.parse(localStorage.getItem(PENDING_RVM_SESSION_KEY) ?? 'null') as {
          sessionId?: string; userId?: string;
        } | null;
        if (!pending || pending.userId !== currentUserId || !/^\d{1,20}$/.test(pending.sessionId ?? '')) return;
        const result = await apiGet<Row>(`/sessions/${encodeURIComponent(pending.sessionId!)}/status`);
        if (stopped) return;
        const status = String(result.status ?? '').toUpperCase();
        if (status === 'COMPLETED') {
          localStorage.removeItem(PENDING_RVM_SESSION_KEY);
          window.dispatchEvent(new Event('bravoforest:wallet-updated'));
        } else if (status === 'CANCELLED' || status === 'EXPIRED') {
          localStorage.removeItem(PENDING_RVM_SESSION_KEY);
        }
      } catch {
        // Keep pending state through temporary network errors; the next poll retries.
      } finally {
        checking = false;
      }
    };
    void refreshCompletedDeposit();
    const timer = window.setInterval(() => void refreshCompletedDeposit(), 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [currentUserId]);

  const logout = async () => {
    try {
      await apiPost('/auth/customer/logout', {});
    } finally {
      clearAccessToken();
      markSignedOut();
      setUser(undefined);
      setBalance(undefined);
      router.push('/login');
    }
  };

  const isLanding = pathname === '/' || pathname === '';

  return (
    <MotionConfig reducedMotion="user">
      <div className="customer-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--obsidian)' }}>
        <div className="rvm-grain-overlay" aria-hidden="true" />
        <UnifiedNavbar user={user} balance={balance} logout={logout} openScanner={openQrScanner} />
        <main style={{ flex: 1, width: '100%', paddingTop: isLanding ? 0 : 80 }}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </main>
        <UnifiedFooter />
        <CustomerQrScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} user={user} />
      </div>
    </MotionConfig>
  );
}

/* =========================================================================
   SECTION 5: CUSTOMER LANDING PAGE
   ========================================================================= */

/* =========================================================================
   HERO INTERACTIVE BOTANICAL ALBUM
   ========================================================================= */

const heroAlbumItems = [
  {
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Closeup_of_Reverse_Vending_Machine_for_Victoria%27s_Container_Deposit_Scheme_in_Sunshine.jpg/1280px-Closeup_of_Reverse_Vending_Machine_for_Victoria%27s_Container_Deposit_Scheme_in_Sunshine.jpg',
    alt: 'Trạm Thu Gom Tự Động 24/7',
    title: 'Trạm Thu Gom Tự Động 24/7',
    desc: 'Hệ thống tự động nhận diện vỏ chai nhựa nước uống trong tích tắc.'
  },
  {
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1280&q=85',
    alt: 'Góp Mầm Xanh Tái Sinh Rừng',
    title: 'Góp Mầm Xanh Rừng Tự Nhiên',
    desc: 'Mỗi vỏ chai thu gom giúp giảm thiểu rác thải và đóng góp cây xanh.'
  },
  {
    image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1280&q=85',
    alt: 'Tái Chế Chai Nhựa PET',
    title: 'Tái Chế Chai Nhựa PET',
    desc: 'Tự động ép gọn tại máy và chuyển tới nhà máy tái chế.'
  },
  {
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1280&q=85',
    alt: 'Điểm Đến Tiện Lợi Khắp Đô Thị',
    title: 'Điểm Đến Tiện Lợi Khắp Đô Thị',
    desc: 'Đặt tại các siêu thị, trường học và khu chung cư để bạn ghé qua mỗi ngày.'
  },
  {
    image: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=1280&q=85',
    alt: 'Hệ Thống Trạm Thu Gom Thông Minh',
    title: 'Mạng Lưới Trạm RVM Đô Thị',
    desc: 'Tra cứu vị trí trạm máy gần bạn và theo dõi điểm thưởng tức thì.'
  }
];

const ecoGalleryItems = [
  { image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1920&q=90', text: '' },
  { image: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1920&q=90', text: '' },
  { image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=90', text: '' },
  { image: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=1920&q=90', text: '' },
  { image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=90', text: '' },
  { image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=1920&q=90', text: '' },
  { image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=90', text: '' },
  { image: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=1920&q=90', text: '' }
];

const partnerBrandLogos = [
  {
    node: (
      <div style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 8px' }}>
        <img src="/logos/partner-th-true-milk.png" alt="TH true MILK" style={{ height: 44, width: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    title: 'TH true MILK'
  },
  {
    node: (
      <div style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 8px' }}>
        <img src="/logos/partner-tomra.png" alt="TOMRA" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    title: 'TOMRA RVM'
  },
  {
    node: (
      <div style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 8px' }}>
        <img src="/logos/partner-coca-cola.png" alt="Coca-Cola" style={{ height: 46, width: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    title: 'Coca-Cola'
  },
  {
    node: (
      <div style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 8px' }}>
        <img src="/logos/partner-circle-k.png" alt="Circle K" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    title: 'Circle K'
  },
  {
    node: (
      <div style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 8px' }}>
        <img src="/logos/partner-highlands.png" alt="Highlands Coffee" style={{ height: 46, width: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    title: 'Highlands Coffee'
  },
  {
    node: (
      <div style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 8px' }}>
        <img src="/logos/partner-tetra-pak.png" alt="Tetra Pak" style={{ height: 46, width: 'auto', objectFit: 'contain' }} />
      </div>
    ),
    title: 'Tetra Pak'
  }
];


function HeroInteractiveAlbum() {
  const accordionItems = heroAlbumItems.map((item) => ({
    image: item.image,
    label: item.title,
    link: '#steps'
  }));

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <AccordionGallery
        items={accordionItems}
        defaultIndex={1}
        height={500}
        expandRatio={0.56}
        gap={12}
        radius={20}
        tilt={6}
        showLabels
        grayscale={false}
        accentColor="#86efac"
        overlayColor="#05130b"
        textColor="#ffffff"
      />
    </div>
  );
}


/* =========================================================================
   INTERACTIVE PROCESS WORKFLOW (DEDICATED 4-STEP ROADMAP & KIOSK SIMULATOR)
   ========================================================================= */

const processSteps = [
  {
    step: '01',
    title: 'Chuẩn bị vỏ chai nhựa',
    desc: 'Dùng chai nhựa uống nước sạch (PET). Giữ vỏ sạch, còn nguyên tem nhãn và không cần đè bẹp.',
    icon: Layers
  },
  {
    step: '02',
    title: 'Quét mã trên điện thoại',
    desc: 'Mở ứng dụng BravoForest, đưa mã thành viên vào ô quét của máy để đăng nhập tài khoản trong tích tắc.',
    icon: QrCode
  },
  {
    step: '03',
    title: 'Bỏ vỏ chai vào máy',
    desc: 'Đặt từng chai vào cửa nhận. Máy sẽ tự nhận biết và thu gom tự động trong vài giây.',
    icon: Scan
  },
  {
    step: '04',
    title: 'Nhận điểm vào ví',
    desc: 'Điểm thưởng được cộng ngay vào tài khoản để bạn tích lũy và đổi các phần quà ăn uống, mua sắm yêu thích.',
    icon: Gift
  }
];

function LandingProcessWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCodeGenerator.toDataURL(
      'https://bravoforest.vn/member/BF-882109?action=deposit&kiosk=RVM-01',
      {
        width: 220,
        margin: 1,
        color: {
          dark: '#112A1D',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      }
    )
      .then((url) => {
        if (active) setQrCodeDataUrl(url);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <motion.section className="landing-process-section" id="steps" style={{ margin: '20px auto 0' }} {...sectionReveal}>
      <div className="landing-section-heading">
        <div>
          <span className="customer-eyebrow">
            <span className="customer-live-dot" />
            HƯỚNG DẪN THU GOM
          </span>
          <h2 style={{ marginTop: 10 }}>Cách gửi vỏ chai tại trạm</h2>
        </div>
        <p>
          Quy trình đơn giản và hoàn toàn tự động, chỉ mất chưa đầy một phút để bạn gửi vỏ chai và tích điểm vào ví.
        </p>
      </div>

      <div className="landing-process-grid">
        {/* Left Column: Interactive Stepper Component */}
        <div className="landing-process-stepper-wrap">
          <Stepper
            initialStep={1}
            step={activeStep + 1}
            onStepChange={(step: number) => {
              if (typeof step === 'number' && step >= 1 && step <= 4) {
                setActiveStep(step - 1);
              }
            }}
            onFinalStepCompleted={() => {
              setActiveStep(3);
            }}
            backButtonText="Quay lại"
            nextButtonText="Tiếp tục"
            completeButtonText="Hoàn thành"
            indicator="numbers"
            theme="light"
            accentColor="#15803d"
            radius={24}
            width="100%"
          >
            <Step title="Chuẩn bị vỏ" description="Chai nhựa nước uống">
              <div className="stepper-step-body-content">
                <span className="stepper-step-pill">Bước 01 · Phân loại</span>
                <h3>Chuẩn bị vỏ chai nhựa nước uống</h3>
                <p>
                  Chọn các loại vỏ chai nhựa sạch (PET dung tích 250ml – 1.5L) còn nguyên vẹn tem nhãn để trạm máy tự động nhận diện mã vạch chuẩn xác.
                </p>
                <div className="stepper-step-tags">
                  <span className="stepper-tag">Chai PET nước uống</span>
                  <span className="stepper-tag">Dung tích 250ml - 1.5L</span>
                  <span className="stepper-tag">Đổ sạch nước đọng</span>
                </div>
              </div>
            </Step>
            <Step title="Quét mã QR" description="Nhận diện tài khoản">
              <div className="stepper-step-body-content">
                <span className="stepper-step-pill">Bước 02 · Kết nối</span>
                <h3>Quét mã QR thành viên</h3>
                <p>
                  Đăng nhập BravoForest trên điện thoại, mở tính năng quét QR và quét mã đang hiển thị trên màn hình máy RVM để liên kết phiên gửi với ví của bạn.
                </p>
                <div className="stepper-step-tags">
                  <span className="stepper-tag">Quét QR bằng tài khoản đã đăng nhập</span>
                  <span className="stepper-tag">Tự động liên kết ví</span>
                </div>
              </div>
            </Step>
            <Step title="Bỏ vào máy" description="Cảm biến quang học">
              <div className="stepper-step-body-content">
                <span className="stepper-step-pill">Bước 03 · Nhận diện</span>
                <h3>Đặt vỏ vào cửa nhận tự động</h3>
                <p>
                  Đặt từng chai vào buồng nhận diện quang học. Hệ thống sẽ quét mã vạch và phân loại, nén gọn tự động sau 3 giây.
                </p>
                <div className="stepper-step-tags">
                  <span className="stepper-tag">Cảm biến quang phổ</span>
                  <span className="stepper-tag">Nén cơ học tự động</span>
                  <span className="stepper-tag">Xử lý ~3 giây / vỏ</span>
                </div>
              </div>
            </Step>
            <Step title="Nhận điểm" description="Tích lũy & đổi quà">
              <div className="stepper-step-body-content">
                <span className="stepper-step-pill">Bước 04 · Nhận thưởng</span>
                <h3>Điểm thưởng vào ví tức thì</h3>
                <p>
                  Nhận ngay 100đ – 300đ cho mỗi vỏ chai được thu gom. Điểm thưởng cộng trực tiếp vào ví để bạn đổi voucher ẩm thực hoặc đóng góp mầm xanh tái sinh rừng tự nhiên.
                </p>
                <div className="stepper-step-tags">
                  <span className="stepper-tag">100đ - 300đ / vỏ</span>
                  <span className="stepper-tag">50+ Voucher ẩm thực</span>
                  <span className="stepper-tag">Góp mầm xanh rừng</span>
                </div>
              </div>
            </Step>
          </Stepper>
        </div>

        {/* Right Column: Dynamic Kiosk Simulator Stage */}
        <div className="landing-process-stage">
          <div className="kiosk-terminal-mockup">
            <div className="kiosk-terminal-body">
              <AnimatePresence mode="wait">
                {activeStep === 0 && (
                  <motion.div
                    key="step0"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28 }}
                    className="kiosk-screen-content"
                  >
                    <h3 className="kiosk-screen-title">Kiểm tra vỏ chai nhựa tiếp nhận</h3>
                    <p className="kiosk-screen-lead">Chỉ tiếp nhận vỏ chai nhựa uống nước sạch (PET), không nhận lon nhôm hay bao bì khác:</p>

                    <div className="kiosk-accepted-grid">
                      <div className="kiosk-accepted-item valid">
                        <CheckCircle2 size={18} className="text-[#178544]" />
                        <div>
                          <strong>Chai nhựa nước uống (PET)</strong>
                          <small>Nước khoáng, nước tinh khiết, trà, nước ngọt (250ml – 1.5L)</small>
                        </div>
                      </div>
                      <div className="kiosk-accepted-item valid">
                        <CheckCircle2 size={18} className="text-[#178544]" />
                        <div>
                          <strong>Tem nhãn &amp; mã vạch rõ ràng</strong>
                          <small>Giữ nguyên tem nhãn để cảm biến quang học quét mã chuẩn xác</small>
                        </div>
                      </div>
                      <div className="kiosk-accepted-item invalid">
                        <AlertTriangle size={18} className="text-[#d9483b]" />
                        <div>
                          <strong>Không tiếp nhận</strong>
                          <small>Lon nhôm các loại, chai thủy tinh, chai dầu ăn, hộp giấy</small>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeStep === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28 }}
                    className="kiosk-screen-content"
                  >
                    <h3 className="kiosk-screen-title">Đưa mã thành viên vào máy</h3>
                    <p className="kiosk-screen-lead">Mã QR thành viên có sẵn trong ứng dụng điện thoại của bạn:</p>

                    <div className="kiosk-scanner-box">
                      <div className="kiosk-scanner-laser" />
                      {qrCodeDataUrl ? (
                        <img
                          src={qrCodeDataUrl}
                          alt="Mã QR thành viên BravoForest"
                          width={140}
                          height={140}
                          style={{ display: 'block', borderRadius: 8, margin: '4px auto' }}
                        />
                      ) : (
                        <div style={{ width: 140, height: 140, background: '#f5f5f5', borderRadius: 8 }} />
                      )}
                      <div className="kiosk-scanner-status">
                        <CheckCircle2 size={15} className="text-[#178544]" />
                        <span>Mã thành viên: <strong>#BF-882109</strong> (Đã kết nối)</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeStep === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28 }}
                    className="kiosk-screen-content"
                  >
                    <h3 className="kiosk-screen-title">Máy đang nhận vỏ chai</h3>
                    <p className="kiosk-screen-lead">Đang nhận diện và tự động thu gom vào khoang chứa:</p>

                    <div className="kiosk-telemetry-box">
                      <div className="telemetry-row">
                        <span>VỎ THU GOM</span>
                        <strong>Chai nhựa uống nước (500ml)</strong>
                      </div>
                      <div className="telemetry-row">
                        <span>TRẠNG THÁI</span>
                        <strong>Đã nhận diện thành công ✓</strong>
                      </div>
                      <div className="telemetry-row">
                        <span>THU GOM</span>
                        <strong>Đang đưa vào thùng chứa tự động</strong>
                      </div>
                      <div className="telemetry-meter">
                        <div className="telemetry-meter-bar" />
                      </div>
                      <small className="telemetry-note">⚡ Thời gian xử lý: khoảng 2 giây / vỏ</small>
                    </div>
                  </motion.div>
                )}

                {activeStep === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.28 }}
                    className="kiosk-screen-content"
                  >
                    <h3 className="kiosk-screen-title">Thu gom thành công!</h3>
                    <p className="kiosk-screen-lead">Điểm thưởng đã được cộng ngay vào tài khoản của bạn:</p>

                    <div className="kiosk-receipt-box">
                      <div className="receipt-points">
                        <span>+150</span>
                        <small>ĐIỂM ĐÃ CỘNG VÀO VÍ</small>
                      </div>
                      <div className="receipt-stats">
                        <div>
                          <strong>+150đ</strong>
                          <small>Điểm tích lũy</small>
                        </div>
                        <div>
                          <strong>1 vỏ</strong>
                          <small>Đã thu hồi</small>
                        </div>
                        <div>
                          <strong>0 VNĐ</strong>
                          <small>Phí sử dụng</small>
                        </div>
                      </div>
                      <Link href="/wallet" className="customer-button customer-button-lime" style={{ width: '100%', marginTop: 14 }}>
                        Xem ví điểm của bạn <ArrowRight size={16} />
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}


function Landing() {
  const router = useRouter();
  const [copiedCmd, setCopiedCmd] = useState(false);

  const handleCopyCmd = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText('bravoforest scan --rvm-station').catch(() => {});
    }
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
    window.dispatchEvent(new Event('bravoforest:open-qr-scanner'));
  };

  return (
    <div className="customer-landing" style={{ background: '#f8faf7', position: 'relative' }}>
      {/* 0. TOP SCROLL-EXPAND SHOWCASE */}
      <div className="landing-expand-wrap" style={{ position: 'relative', width: '100%', margin: 0, padding: 0, background: '#000000' }}>
        <ScrollExpand
          src="https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=85"
          alt="Cánh rừng tái sinh cùng BravoForest"
          title={
            <MaskedHeading
              text="Bravo Forest"
              tag="h1"
              src="https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=85"
              mediaType="image"
              reveal="rise"
              align="center"
              weight={900}
              brightness={1.3}
              outline
              outlineColor="rgba(255,255,255,0.4)"
              outlineWidth={1}
              style={{ fontSize: 'clamp(36px, 6vw, 76px)', letterSpacing: '-0.02em', margin: 0, textShadow: 'none', filter: 'none' }}
            />
          }
          scrollHint="Cuộn để mở rộng"
          scrollDistance={1.0}
          holdDistance={0.45}
          overlayScrim={0.55}
          useWindowScroll
        >
          <div style={{ maxWidth: 740, margin: '0 auto', textAlign: 'center', color: '#ffffff', padding: '0 20px' }}>
            <span style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#86efac', fontWeight: 800, display: 'inline-block', marginBottom: 12, textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>
              🌿 HÀNH TRÌNH TUẦN HOÀN BẢO VỆ MÔI TRƯỜNG
            </span>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 800, margin: '0 0 16px', lineHeight: 1.2, color: '#ffffff', textShadow: '0 4px 24px rgba(0,0,0,0.85)' }}>
              Mỗi vỏ chai là một mầm xanh rừng tự nhiên
            </h2>
            <p style={{ fontSize: 'clamp(14.5px, 1.7vw, 18px)', color: 'rgba(255,255,255,0.95)', lineHeight: 1.65, margin: 0, textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
              Thu gom vỏ chai nhựa nước uống tại các trạm RVM thông minh 24/7 để nhận điểm thưởng tức thì và chung tay kiến tạo màu xanh cho tương lai.
            </p>
          </div>
        </ScrollExpand>
      </div>

      {/* 1. HERO SECTION WITH INTERACTIVE ALBUM */}
      <motion.section
        className="landing-hero"
        id="hero"
        variants={heroGroup}
        initial="hidden"
        animate="show"
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'transparent',
          paddingTop: 54,
          paddingBottom: 16
        }}
      >
        <div className="landing-hero-inner" style={{ position: 'relative', zIndex: 1 }}>
          <motion.div className="landing-hero-copy" variants={heroItem}>
            <h1 style={{ color: '#112A1D', letterSpacing: '-0.025em' }}>
              Gửi vỏ chai.<br />
              <span style={{ color: '#15803d' }}>Nhận điểm.</span>
            </h1>
            <p style={{ color: '#456353', fontSize: 16.5, lineHeight: 1.75 }}>
              Tìm trạm RVM, gửi chai nhựa nước uống và theo dõi điểm thưởng trong tài khoản của bạn.
            </p>
            <div className="landing-hero-actions" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <SpecularButton
                size="lg"
                radius={9999}
                tint="#86efac"
                tintOpacity={0.25}
                textColor="#ffffff"
                style={{
                  background: '#15803d',
                  color: '#ffffff',
                  fontWeight: 800,
                  padding: '13px 26px',
                  fontSize: 15.5,
                  cursor: 'pointer',
                  border: 'none',
                  boxShadow: '0 6px 24px rgba(21, 128, 61, 0.28)'
                }}
                onClick={() => router.push('/machines')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Tìm trạm RVM <ArrowRight size={17} />
                </span>
              </SpecularButton>
              <Link
                href="#steps"
                className="customer-button customer-button-outline"
                style={{
                  color: '#112A1D',
                  borderColor: 'rgba(17, 42, 29, 0.2)',
                  background: '#ffffff',
                  padding: '12px 22px',
                  borderRadius: 9999,
                  boxShadow: '0 2px 8px rgba(17, 42, 29, 0.04)'
                }}
              >
                Xem cách gửi
              </Link>
            </div>
          </motion.div>

          <motion.div className="landing-hero-visual" variants={heroItem}>
            <HeroInteractiveAlbum />
          </motion.div>
        </div>
      </motion.section>

      {/* 1.2 BRAND PARTNERS LOOP (BETWEEN HERO AND STEPS) */}
      <FadeContent effect="mist" duration={1.0} ease="power2.out" threshold={0.1}>
        <section className="landing-partners-loop" id="partners" style={{ maxWidth: 1240, margin: '4px auto 0', padding: '0 24px' }}>
          <div style={{ height: '62px', position: 'relative', overflow: 'hidden' }}>
            <LogoLoop
              logos={partnerBrandLogos}
              speed={60}
              direction="left"
              logoHeight={46}
              gap={56}
              scaleOnHover
              ariaLabel="Các thương hiệu đối tác đồng hành cùng BravoForest"
            />
          </div>
        </section>
      </FadeContent>

      {/* 1.5 DEDICATED 4-STEP PROCESS WORKFLOW WITH STEPPER (IMMEDIATELY AFTER HERO) */}
      <FadeContent effect="mist" duration={1.2} ease="power2.out" threshold={0.1}>
        <LandingProcessWorkflow />
      </FadeContent>

      {/* 2. ENRICHED ACTION STRIP (CLEAN MODERN CARDS WITH SPOTLIGHT EFFECT) */}
      <FadeContent effect="mist" duration={1.2} ease="power2.out" threshold={0.1}>
        <section className="landing-proof-strip" aria-label="Khám phá nhanh dịch vụ" style={{ maxWidth: 1240, margin: '20px auto 44px', padding: '0 24px' }}>
          <PixelCard
            variant="default"
            theme="light"
            colors={['#15803d', '#22c55e', '#86efac']}
            glowColor="#22c55e"
            radius={24}
            className="landing-proof-card landing-proof-pixel-card"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}
          >
            <div className="landing-proof-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span className="landing-proof-icon">
                <MapPin size={22} aria-hidden="true" />
              </span>
            </div>

            <div className="landing-proof-media" style={{ position: 'relative', width: '100%', height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
              <Image
                src="https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=85"
                alt="Mạng lưới trạm RVM thu gom bao bì thông minh tại đô thị"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 33vw"
                style={{ objectFit: 'cover' }}
              />
            </div>

            <div className="landing-proof-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 750, color: '#12281a', letterSpacing: '-0.025em' }}>
                  Tìm trạm RVM gần nhất
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: '#556b5d' }}>
                  Tra cứu vị trí chính xác của từng trạm máy, kiểm tra sức chứa hiện tại và dẫn đường trực tiếp 24/7.
                </p>
              </div>

              <Link href="/machines" className="landing-proof-link" style={{ marginTop: 'auto' }}>
                <span>Mở bản đồ tìm trạm</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </PixelCard>

          <PixelCard
            variant="default"
            theme="light"
            colors={['#15803d', '#22c55e', '#86efac']}
            glowColor="#22c55e"
            radius={24}
            className="landing-proof-card landing-proof-pixel-card"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}
          >
            <div className="landing-proof-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span className="landing-proof-icon">
                <QrCode size={22} aria-hidden="true" />
              </span>
            </div>

            <div className="landing-proof-media" style={{ position: 'relative', width: '100%', height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
              <Image
                src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=85"
                alt="Thao tác gửi vỏ chai nhựa vào cửa thu gom phân loại tự động"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 33vw"
                style={{ objectFit: 'cover' }}
              />
            </div>

            <div className="landing-proof-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 750, color: '#12281a', letterSpacing: '-0.025em' }}>
                  Gửi vỏ chai nhựa PET
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: '#556b5d' }}>
                  Cảm biến quang phổ quét mã vạch và nhận diện chất liệu trong 3 giây. Ép nén cơ học và cộng điểm trực tiếp vào ví.
                </p>
              </div>

              <Link href="#steps" className="landing-proof-link" style={{ marginTop: 'auto' }}>
                <span>Xem hướng dẫn 4 bước</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </PixelCard>

          <PixelCard
            variant="default"
            theme="light"
            colors={['#15803d', '#22c55e', '#86efac']}
            glowColor="#22c55e"
            radius={24}
            className="landing-proof-card landing-proof-pixel-card"
            style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}
          >
            <div className="landing-proof-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span className="landing-proof-icon">
                <Gift size={22} aria-hidden="true" />
              </span>
            </div>

            <div className="landing-proof-media" style={{ position: 'relative', width: '100%', height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
              <Image
                src="https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=85"
                alt="Ưu đãi ẩm thực cà phê và phần thưởng sinh thái"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 33vw"
                style={{ objectFit: 'cover' }}
              />
            </div>

            <div className="landing-proof-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 750, color: '#12281a', letterSpacing: '-0.025em' }}>
                  Đổi voucher &amp; Quà tặng
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: 13.5, lineHeight: 1.6, color: '#556b5d' }}>
                  Sử dụng điểm tích luỹ để đổi voucher mua sắm, ẩm thực, vé xem phim hoặc đóng góp mầm xanh tái sinh rừng tự nhiên.
                </p>
              </div>

              <Link href="/rewards" className="landing-proof-link" style={{ marginTop: 'auto' }}>
                <span>Khám phá kho quà tặng</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </PixelCard>
        </section>
      </FadeContent>

      {/* 2.5 CIRCULAR 3D WEBGL2 GALLERY (SECOND PHOTO EXHIBITION - FULL BLEED) */}
      <FadeContent effect="mist" duration={1.2} ease="power2.out" threshold={0.1} style={{ width: '100%', overflow: 'hidden' }}>
        <section className="landing-gallery-section" style={{ width: '100%', maxWidth: '100vw', margin: '36px 0 20px', padding: 0, overflow: 'hidden' }}>
          <div style={{ maxWidth: 1240, margin: '0 auto 24px', padding: '0 28px' }}>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px, 3.5vw, 40px)', fontWeight: 800, color: '#112A1D', letterSpacing: '-0.025em' }}>
              Không gian
            </h2>
          </div>

          <LazyOnView
            style={{
              position: 'relative',
              width: '100%',
              height: '420px',
              overflow: 'hidden'
            }}
          >
            <CircularGallery
              bend={2.2}
              textColor="transparent"
              borderRadius={0.06}
              scrollEase={0.05}
              itemSize={0.78}
              itemAspect={0.72}
              gap={0.18}
              showTitles={false}
              items={ecoGalleryItems}
            />
          </LazyOnView>
        </section>
      </FadeContent>

      {/* 3.5 RVM MAP CALLOUT WITH SPOTLIGHT & SPECULAR BUTTON */}
      <FadeContent effect="mist" duration={1.2} ease="power2.out" threshold={0.1}>
        <section className="landing-rvm-cta" id="locations" style={{ maxWidth: 1240, margin: '48px auto', padding: '0 24px' }}>
          <SpotlightCard theme="dark" spotlightColor="rgba(134, 239, 172, 0.2)" style={{ padding: 0, width: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', minHeight: 340, width: '100%' }}>
              <div className="landing-rvm-cta-image" style={{ position: 'relative', minHeight: 280 }}>
                <Image
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/NSW_Return_and_Earn_scheme_automatic_recycling_sorting_centre.jpg/1280px-NSW_Return_and_Earn_scheme_automatic_recycling_sorting_centre.jpg"
                  alt="Khu vực máy RVM của chương trình Return and Earn tại New South Wales"
                  fill
                  unoptimized
                  sizes="(max-width: 620px) 100vw, 65vw"
                />
              </div>
              <div className="landing-rvm-cta-copy" style={{ padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h2>Tìm trạm RVM</h2>
                <p>Xem vị trí và thông tin máy trên bản đồ.</p>
                <div style={{ marginTop: 16 }}>
                  <SpecularButton
                    size="md"
                    radius={9999}
                    tint="#86efac"
                    tintOpacity={0.25}
                    textColor="#ffffff"
                    style={{
                      background: '#15803d',
                      color: '#ffffff',
                      fontWeight: 700,
                      padding: '11px 22px',
                      fontSize: 14.5,
                      cursor: 'pointer',
                      border: 'none'
                    }}
                    onClick={() => router.push('/machines')}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Mở bản đồ <ArrowRight size={16} />
                    </span>
                  </SpecularButton>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </section>
      </FadeContent>

      {/* 3.9 TELEMETRY / IMPACT - MERGED CAPSULE CTA WITH MẦM XANH BACKGROUND */}
      <FadeContent effect="mist" duration={1.2} ease="power2.out" threshold={0.1}>
        <section
          className="landing-impact"
          id="telemetry"
          style={{
            maxWidth: 1240,
            margin: '40px auto 36px',
            padding: '0 24px',
            boxSizing: 'border-box'
          }}
        >
          <SpotlightCard
            theme="dark"
            spotlightColor="rgba(34, 197, 94, 0.22)"
            spotlightSize={440}
            style={{
              background: 'linear-gradient(135deg, #092316 0%, #061910 50%, #082115 100%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 32,
              padding: 'clamp(52px, 6.5vw, 80px) clamp(24px, 5vw, 64px)',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 24px 70px -15px rgba(0, 0, 0, 0.65)'
            }}
          >
            {/* Background Mầm Xanh Image with atmospheric dark eco overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none'
              }}
            >
              <Image
                src="https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1920&q=85"
                alt="Mầm xanh tái sinh"
                fill
                unoptimized
                style={{ objectFit: 'cover', opacity: 0.42, filter: 'saturate(1.3) brightness(0.95)' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(ellipse at 50% 50%, rgba(34, 197, 94, 0.20) 0%, rgba(21, 128, 61, 0.08) 55%, transparent 80%), linear-gradient(180deg, rgba(8, 28, 18, 0.76) 0%, rgba(5, 19, 12, 0.90) 100%)'
                }}
              />
              {/* Subtle Grid Overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage:
                    'linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                  opacity: 0.6
                }}
              />
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
              {/* Monospace Code Tag */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#8b949e',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  marginBottom: 22,
                  userSelect: 'none'
                }}
              >
                <span style={{ color: '#4b5563' }}>//</span>
                <span style={{ color: '#22c55e' }}>&gt;_</span>
                <span>THEO DÕI HÀNH TRÌNH XANH</span>
                <span style={{ color: '#4b5563' }}>\\</span>
              </div>

              {/* Title: Theo dõi từng lần gửi. */}
              <h2
                style={{
                  fontFamily: 'var(--font-display, inherit)',
                  fontSize: 'clamp(32px, 4.6vw, 54px)',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.15,
                  margin: '0 auto 18px',
                  maxWidth: 820
                }}
              >
                Theo dõi từng lần gửi.
              </h2>

              {/* Description: Lịch sử thu hồi được lưu trong tài khoản. */}
              <p
                style={{
                  color: '#9ca3af',
                  fontSize: 'clamp(14.5px, 1.35vw, 16px)',
                  lineHeight: 1.65,
                  maxWidth: 680,
                  margin: '0 auto 34px'
                }}
              >
                Lịch sử thu hồi được lưu trong tài khoản. Mỗi lần gửi chai là một mầm xanh được gieo trồng và tích lũy điểm thưởng bền vững.
              </p>

              {/* Capsule Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                  margin: '0 auto'
                }}
              >
                {/* White Primary Capsule Button: Xem lịch sử gửi */}
                <button
                  type="button"
                  onClick={() => router.push('/history')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '13px 28px',
                    borderRadius: 9999,
                    background: '#ffffff',
                    color: '#0f172a',
                    border: 'none',
                    fontSize: 14.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 20px rgba(255, 255, 255, 0.22)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(255, 255, 255, 0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 255, 255, 0.22)';
                  }}
                >
                  <span>Xem lịch sử gửi</span>
                  <ArrowRight size={16} />
                </button>

                {/* Dark Outline Secondary Capsule Button: Khám phá quà tặng */}
                <button
                  type="button"
                  onClick={() => router.push('/rewards')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '13px 26px',
                    borderRadius: 9999,
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#f3f4f6',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    fontSize: 14.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                  }}
                >
                  <span>Khám phá quà tặng</span>
                </button>
              </div>

              {/* Bottom Interactive Terminal Pill: $ bravoforest scan --rvm-station */}
              <div style={{ marginTop: 36 }}>
                <button
                  type="button"
                  onClick={handleCopyCmd}
                  title="Bấm để mở camera quét QR trạm RVM"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 20px',
                    borderRadius: 9999,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.09)',
                    color: '#e2e8f0',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.09)';
                  }}
                >
                  <span style={{ color: '#22c55e', fontWeight: 700 }}>$</span>
                  <span>bravoforest scan --rvm-station</span>
                  {copiedCmd ? (
                    <Check size={14} style={{ color: '#22c55e', marginLeft: 4 }} />
                  ) : (
                    <Copy size={13} style={{ color: '#64748b', marginLeft: 4 }} />
                  )}
                </button>
              </div>
            </div>
          </SpotlightCard>
        </section>
      </FadeContent>
    </div>
  );
}



/* =========================================================================
   SECTION 6: AUTH PAGES (LIGHT 60/40 ENVIRONMENTAL GRID)
   ========================================================================= */

function Auth({ register = false, forgot = false }: { register?: boolean; forgot?: boolean }) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const router = useRouter();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const submittedEmail = String(fd.get('email') || email).trim().toLowerCase();
    try {
      if (forgot) {
        if (!otpSent) {
          await apiPost('/auth/password-reset/request', { email: submittedEmail });
          setEmail(submittedEmail);
          setOtpSent(true);
          setOtpVerified(false);
          setOtpCode('');
          setMessage('Nếu email thuộc tài khoản đang hoạt động, mã xác nhận sẽ được gửi tới hộp thư đó.');
          return;
        }
        if (!otpVerified) {
          await apiPost('/auth/password-reset/verify', {
            email: submittedEmail,
            code: fd.get('code')
          });
          setOtpVerified(true);
          setMessage('Mã xác nhận chính xác. Hãy tạo mật khẩu mới để tiếp tục.');
          return;
        }
        const password = String(fd.get('newPassword') || '');
        if (password !== String(fd.get('confirmPassword') || '')) throw new Error('Mật khẩu xác nhận chưa khớp.');
        await apiPost('/auth/password-reset/confirm', {
          email: submittedEmail,
          code: fd.get('code'),
          newPassword: password
        });
        setResetComplete(true);
        setMessage('Mật khẩu đã được đổi. Bạn có thể đăng nhập lại.');
        return;
      }

      if (register && !otpSent) {
        const phone = String(fd.get('phone') || '');
        await apiPost('/auth/register', {
          fullName: fd.get('fullName'),
          email: submittedEmail,
          phone: phone || undefined,
          password: fd.get('password')
        });
        setEmail(submittedEmail);
        setOtpSent(true);
        setMessage('Mã xác nhận đã được gửi tới email của bạn.');
        return;
      }

      if (register) {
        const result = await apiPost<{ accessToken: string }>('/auth/register/verify', {
          email: submittedEmail,
          code: fd.get('code')
        });
        setAccessToken(result.accessToken);
      } else {
        const result = await apiPost<{ accessToken: string }>('/auth/customer/login', {
          identifier: submittedEmail,
          password: fd.get('password')
        });
        setAccessToken(result.accessToken);
      }
      const profile = await apiGet<Row>('/auth/me');
      if (String(val(profile, 'role', 'role_name')).toUpperCase() !== 'CUSTOMER') {
        clearAccessToken();
        throw new Error('Tài khoản này không có quyền khách hàng. Vui lòng dùng đúng cổng đăng nhập.');
      }
      router.push('/wallet');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể hoàn tất yêu cầu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="customer-auth"
    >
      <div className="customer-auth-image">
        <Image
          src="https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=1800&q=85"
          alt="Ánh nắng ban mai xuyên qua rừng thông nguyên sinh BravoForest"
          fill
          sizes="(max-width: 800px) 100vw, 58vw"
          priority
        />
      </div>

      <div className="customer-auth-form-panel">
        <AnimatedContent distance={35} duration={0.65} ease="power3.out">
          <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <Link href="/" className="customer-brand" style={{ marginBottom: 28, display: 'inline-flex' }} aria-label="BravoForest, về trang chủ">
            <span className="customer-brand-mark" aria-hidden="true">
              <img src="/icon.png" alt="BravoForest" width={28} height={28} />
            </span>
            <span className="customer-brand-copy">
              <strong>BravoForest</strong>
            </span>
          </Link>
          {!forgot && <div className="customer-auth-tabs" aria-label="Chọn hình thức">
            <Link
              href="/login"
              className={`customer-auth-tab${!register ? ' is-active' : ''}`}
              aria-current={!register ? 'page' : undefined}
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className={`customer-auth-tab${register ? ' is-active' : ''}`}
              aria-current={register ? 'page' : undefined}
            >
              Đăng ký
            </Link>
          </div>}

          <div style={{ marginBottom: 28 }}>
            <h1
              className="font-display font-bold text-2xl text-[#112A1D]"
              style={{ margin: 0, letterSpacing: '-0.02em' }}
            >
              {forgot ? otpVerified ? 'Tạo mật khẩu mới' : 'Xác minh email' : register ? otpSent ? 'Xác nhận email' : 'Tạo tài khoản' : 'Đăng nhập'}
            </h1>
          </div>

          {forgot && resetComplete ? (
            <div className="customer-auth-feedback" role="status">
              <Check size={17} />
              <span>{message}</span>
              <Link href="/login">Đăng nhập</Link>
            </div>
          ) : (
          <>
          {message && <p className="customer-auth-message" role="status">{message}</p>}

          {error && (
            <div
              className="rvm-status-line error"
              style={{ width: '100%', marginBottom: 24, padding: '12px 14px', background: '#FEE2E2' }}
            >
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'grid', gap: 24 }}>
            {register && !otpSent && (
              <div>
                <label className="rvm-input-label" htmlFor="auth-full-name">HỌ VÀ TÊN</label>
                <input
                  id="auth-full-name"
                  name="fullName"
                  placeholder="Nguyễn Văn A"
                  autoComplete="name"
                  required
                  className="rvm-input-underline"
                />
              </div>
            )}

            {(!register || !otpSent) && (!forgot || !otpSent) && (
              <div>
                <label className="rvm-input-label" htmlFor="auth-email">EMAIL</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  placeholder="ban@email.com"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rvm-input-underline"
                />
              </div>
            )}

            {register && !otpSent && (
              <div>
                <label className="rvm-input-label" htmlFor="auth-phone">SỐ ĐIỆN THOẠI (KHÔNG BẮT BUỘC)</label>
                <input
                  id="auth-phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="0[0-9]{9}"
                  maxLength={10}
                  placeholder="0901234567"
                  autoComplete="tel-national"
                  onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                  className="rvm-input-underline"
                />
              </div>
            )}

            {otpSent && (register || forgot) && (
              <>
                <div>
                  <label className="rvm-input-label" htmlFor="auth-email-confirm">EMAIL</label>
                  <input id="auth-email-confirm" name="email" type="email" value={email} readOnly className="rvm-input-underline" />
                </div>
                <div>
                  <label className="rvm-input-label">MÃ XÁC NHẬN (6 CHỮ SỐ)</label>
                  <input type="hidden" name="code" value={otpCode} />
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
                    <CodeSlots
                      length={6}
                      value={otpCode}
                      onChange={(value) => {
                        setOtpCode(value);
                        if (forgot) setOtpVerified(false);
                      }}
                      autoFocus
                      status={error ? 'error' : (forgot ? otpVerified : otpCode.length === 6) ? 'success' : 'idle'}
                    />
                  </div>
                </div>
              </>
            )}

            {!forgot && (!register || !otpSent) && (
            <div>
              <label className="rvm-input-label" htmlFor="auth-password">MẬT KHẨU</label>
              <div className="customer-password-field">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={register ? 'Ít nhất 10 ký tự' : '••••••••'}
                  minLength={register ? 10 : undefined}
                  maxLength={72}
                  required
                  className="rvm-input-underline"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            )}

            {forgot && otpSent && otpVerified && (
              <>
                <div>
                  <label className="rvm-input-label" htmlFor="reset-password">MẬT KHẨU MỚI</label>
                  <input id="reset-password" name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required className="rvm-input-underline" />
                </div>
                <div>
                  <label className="rvm-input-label" htmlFor="reset-confirm-password">NHẬP LẠI MẬT KHẨU MỚI</label>
                  <input id="reset-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required className="rvm-input-underline" />
                </div>
              </>
            )}

            <button
              disabled={busy}
              type="submit"
              className="rvm-btn-primary"
              style={{ width: '100%', marginTop: 8 }}
            >
              <span>{busy ? 'Đang xử lý…' : forgot ? otpSent ? otpVerified ? 'Đổi mật khẩu' : 'Xác minh mã OTP' : 'Gửi mã OTP' : register ? otpSent ? 'Xác nhận email' : 'Đăng ký' : 'Đăng nhập'}</span>
            </button>
          </form>
          {!forgot && !register && <Link className="customer-forgot-link" href="/forgot-password">Quên mật khẩu?</Link>}
          {forgot && !resetComplete && <Link className="customer-forgot-link" href="/login">Quay lại đăng nhập</Link>}
          {register && otpSent && <Link className="customer-forgot-link" href="/login">Quay lại đăng nhập</Link>}
          </>
          )}
        </div>
        </AnimatedContent>
      </div>
    </div>
  );
}

/* =========================================================================
   SECTION 7: CUSTOMER PORTAL (LIGHT DASHBOARD / WALLET)
   ========================================================================= */

function Wallet() {
  const me = useApi<Row>('/auth/me');
  const tx = useApi<unknown>('/wallet/transactions');
  const rows = rowsFrom<Row>(tx.data);

  useEffect(() => {
    const refreshWallet = () => { me.refresh(); tx.refresh(); };
    window.addEventListener('bravoforest:wallet-updated', refreshWallet);
    return () => window.removeEventListener('bravoforest:wallet-updated', refreshWallet);
  }, [me.refresh, tx.refresh]);

  const rawBalance = me.data?.wallet?.balance === undefined ? null : Number(me.data.wallet.balance);
  const pointsBalance = rawBalance;
  const [hideBalance, setHideBalance] = useState(false);

  return (
    <div className="customer-page" style={{ background: 'var(--obsidian)', padding: '48px 24px 80px' }}>
      <AnimatedContent distance={30} duration={0.65} ease="power3.out">
        <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto' }}>
        {/* Row 1: Hero Balance Card (7 cols) | Instant Pass QR (5 cols) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: 24,
            marginBottom: 48
          }}
        >
          {/* Hero Balance Card (7 cols) */}
          <div
            className="col-span-12 lg:col-span-7"
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--line-dark)',
              padding: 'clamp(28px, 4vw, 44px)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: 340,
              boxShadow: '0 12px 36px -10px rgba(21, 128, 61, 0.08)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span className="font-mono text-xs uppercase tracking-wider text-[#456353] font-bold">
                  SỐ DƯ HIỆN TẠI
                </span>
                <button
                  type="button"
                  onClick={() => setHideBalance(!hideBalance)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-on-dark-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  className="font-mono text-xs font-semibold"
                >
                  {hideBalance ? <EyeOff size={16} /> : <Eye size={16} />}
                  <span>{hideBalance ? 'HIỆN' : 'ẨN'}</span>
                </button>
              </div>

              <div
                className="font-display font-bold text-[#112A1D] rvm-tabular"
                style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1.05, marginBottom: 12 }}
              >
                {hideBalance ? '••••••• điểm' : pointsBalance === null ? '—' : `${fmtNum(pointsBalance)} điểm`}
              </div>

            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 28 }}>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('bravoforest:open-qr-scanner'))}
                className="rvm-btn-primary"
              >
                <Scan size={16} />
                <span>Quét QR tại máy</span>
              </button>
              <Link href="/rewards" className="rvm-btn-secondary">
                <span>Đổi quà ngay</span>
                <Gift size={16} />
              </Link>
            </div>
          </div>

          {/* Member QR (5 cols) */}
          <div
            className="col-span-12 lg:col-span-5"
            style={{
              background: '#FFFFFF',
              color: '#112A1D',
              border: '1px solid var(--line-dark)',
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: 340,
              boxShadow: '0 12px 36px -10px rgba(21, 128, 61, 0.08)'
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 18, background: '#e7f3e8', color: '#157a40', display: 'grid', placeItems: 'center', marginBottom: 18 }}>
              <QrCode size={30} aria-hidden="true" />
            </div>
            <h2 className="font-display text-xl font-bold text-[#112A1D] m-0 mb-2">Đăng nhập máy RVM</h2>
            <p className="font-ui text-sm text-[#456353] m-0 mb-5" style={{ maxWidth: 330, lineHeight: 1.6 }}>
              Mã QR được hiển thị tại máy. Dùng điện thoại đã đăng nhập để quét và kết nối đúng ví điểm.
            </p>
            <ol style={{ alignSelf: 'stretch', textAlign: 'left', margin: 0, paddingLeft: 22, color: '#456353', fontSize: 13, lineHeight: 1.9 }}>
              <li>Chọn “Tài khoản Thành viên” trên máy.</li>
              <li>Trên điện thoại, chọn “Quét QR tại máy”.</li>
              <li>Máy tự đăng nhập sau khi xác nhận.</li>
            </ol>
          </div>
        </div>

        <CustomerCashoutPanel pointsBalance={pointsBalance} onSubmitted={() => { me.refresh(); tx.refresh(); }} />

        {/* Row 2: Hành Trình Của Bạn (Transaction Table) */}
        <div style={{ background: '#FFFFFF', border: '1px solid var(--line-dark)', padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <span className="font-mono text-xs uppercase text-[#456353] font-bold block mb-1">
                NHẬT KÝ GIAO DỊCH
              </span>
              <h2 className="font-display text-xl font-bold text-[#112A1D] m-0">
                Hành trình của bạn
              </h2>
            </div>
            <Link href="/history" className="rvm-btn-ghost font-mono text-xs font-bold text-[#15803D]">
              XEM TOÀN BỘ <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <ApiMessage
            loading={tx.loading || me.loading}
            error={tx.error || me.error}
            empty={!rows.length}
            emptyText="Chưa có vỏ chai nào. Lần nạp đầu tiên của bạn sẽ hiện ở đây."
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line-dark)' }}>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">THỜI GIAN</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">NỘI DUNG / TRẠM MÁY</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold text-right">BIẾN ĐỘNG TIỀN</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold text-right">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => {
                    const pts = Number(val(r, 'points') || 0);
                    const isPositive = pts >= 0;
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: '1px solid var(--line-dark)',
                          transition: 'background 150ms ease'
                        }}
                      >
                        <td className="font-mono text-xs text-[#456353] py-4">
                          {fmtDate(val(r, 'created_at', 'createdAt'))}
                        </td>
                        <td className="font-ui text-sm text-[#112A1D] py-4 font-semibold">
                          {val(r, 'note') || val(r, 'txn_type', 'txnType') || 'Nạp vỏ chai tự động'}
                        </td>
                        <td
                          className="font-ui text-sm font-bold text-right py-4 rvm-tabular"
                          style={{ color: isPositive ? 'var(--amber)' : 'var(--text-on-dark-muted)' }}
                        >
                          {isPositive ? '+' : ''}{fmtNum(pts)} điểm
                        </td>
                        <td className="py-4 text-right">
                          <span className={`rvm-status-line ${isPositive ? '' : 'pending'}`}>
                            {isPositive ? 'ĐÃ CỘNG' : 'ĐÃ ĐỔI'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ApiMessage>
        </div>
        </div>
      </AnimatedContent>
    </div>
  );
}

/* =========================================================================
   PAGE 8.1: TÌM MÁY RVM (/machines, 38% LIST / 62% MAP)
   ========================================================================= */

function Machines() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => setPage(1), [searchTerm, cityFilter]);
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '10',
    search: searchTerm,
    city: cityFilter === 'all' ? '' : cityFilter
  });
  const locations = useApi<unknown>(`/map?${query.toString()}`);
  const rows = rowsFrom<Row>(locations.data);
  const pageData = locations.data && typeof locations.data === 'object' ? locations.data as Row : {};
  const total = Number(pageData.total ?? 0);
  const totalPages = Number(pageData.totalPages ?? 0);
  const cities = Array.isArray(pageData.cities) ? pageData.cities.map(String) : [];

  const mapPoints = useMemo(() => {
    return rows.flatMap((r) => {
      const latitude = Number(val(r, 'latitude'));
      const longitude = Number(val(r, 'longitude'));
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || val(r, 'latitude') === '' || val(r, 'longitude') === '') return [];
      return [{
        id: Number(val(r, 'location_id', 'id')),
        name: String(val(r, 'name')),
        address: [val(r, 'address'), val(r, 'ward'), val(r, 'district'), val(r, 'city')].filter(Boolean).join(', '),
        latitude,
        longitude,
        machineCount: Number(val(r, 'machine_count') || 0)
      }];
    });
  }, [rows]);

  return (
    <div className="customer-page customer-machines">
      <FadeContent effect="fade" blur={false} duration={0.5}>
        <div className="customer-machines-inner">
        <header className="customer-machines-heading">
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-[#112A1D]" style={{ letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            Tìm trạm RVM
          </h1>
          <p className="font-ui text-sm sm:text-base text-[#456353]" style={{ margin: 0, lineHeight: 1.6 }}>
            Bản đồ định vị và danh sách các điểm thu gom vỏ chai tuần hoàn BravoForest trên toàn quốc.
          </p>
        </header>

        <div className="customer-machines-toolbar">
          <div className="customer-city-filters" aria-label="Lọc theo thành phố">
            {[{ id: 'all', label: 'Tất cả' }, ...cities.map((city) => ({ id: city, label: city }))].map((city) => (
              <button key={city.id} type="button" aria-pressed={cityFilter === city.id} className={cityFilter === city.id ? 'is-active' : ''} onClick={() => setCityFilter(city.id)}>
                {city.label}
              </button>
            ))}
          </div>
          <label className="customer-machine-search">
            <Search size={17} aria-hidden="true" />
            <input type="search" placeholder="Tìm tên, địa chỉ hoặc thành phố" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </label>
        </div>

        <div className="customer-machines-grid">
          <div className="customer-machine-list">
            <ApiMessage
              loading={locations.loading}
              error={locations.error}
              empty={!rows.length}
              emptyText={searchTerm || cityFilter !== 'all' ? 'Không tìm thấy địa điểm phù hợp.' : 'Chưa có địa điểm nào được công khai.'}
            >
              {rows.map((location) => {
                const address = [val(location, 'address'), val(location, 'ward'), val(location, 'district'), val(location, 'city')].filter(Boolean).join(', ');
                const machineCount = Number(val(location, 'machine_count') || 0);
                const query = encodeURIComponent(address);
                return (
                  <SpotlightCard
                    key={val(location, 'location_id', 'id')}
                    theme="light"
                    spotlightColor="rgba(21, 128, 61, 0.12)"
                    spotlightSize={260}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid rgba(17, 42, 29, 0.08)',
                      borderRadius: 18,
                      padding: '24px 22px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 16,
                      boxShadow: '0 4px 20px -2px rgba(17, 42, 29, 0.04)'
                    }}
                  >
                    <div>
                      <h2 className="font-display font-bold text-lg text-[#112A1D] mb-1.5" style={{ margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                        {val(location, 'name')}
                      </h2>
                      <p className="font-ui text-xs sm:text-sm text-[#456353]" style={{ margin: 0, lineHeight: 1.5 }}>
                        {address}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(17, 42, 29, 0.06)' }}>
                      <span className="font-mono text-xs font-bold text-[#15803D] uppercase tracking-wide">
                        {fmtNum(machineCount)} máy RVM
                      </span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${query}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: '#15803d',
                          textDecoration: 'none'
                        }}
                      >
                        Mở bản đồ <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    </div>
                  </SpotlightCard>
                );
              })}
            </ApiMessage>
            {totalPages > 1 && (
              <nav aria-label="Phân trang địa điểm" className="customer-pagination">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Trước</button>
                <span>Trang {page} / {totalPages} · {total.toLocaleString('vi-VN')} địa điểm</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Tiếp</button>
              </nav>
            )}
          </div>
          <div className="customer-machine-map">
            <RvmMap
              points={mapPoints}
              loading={locations.loading && !mapPoints.length}
              error={!mapPoints.length ? locations.error : undefined}
            />
          </div>
        </div>
        </div>
      </FadeContent>
    </div>
  );
}

/* =========================================================================
   PAGE 8.2: KHO QUÀ TẶNG (/rewards)
   ========================================================================= */

function Rewards() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => setPage(1), [searchTerm, categoryFilter]);
  const query = new URLSearchParams({ page: String(page), pageSize: '12', search: searchTerm, category: categoryFilter });
  const result = useApi<unknown>(`/vouchers?${query.toString()}`);
  const router = useRouter();
  const apiCatalog = rowsFrom<Row>(result.data);
  const pageData = result.data && typeof result.data === 'object' ? result.data as Row : {};
  const total = Number(pageData.total ?? 0);
  const totalPages = Number(pageData.totalPages ?? 0);
  const categories = Array.isArray(pageData.categories) ? pageData.categories.map(String) : [];
  const catalog = apiCatalog.map((row): RewardItem => ({
    id: Number(val(row, 'voucher_id', 'id')),
    partnerId: Number(val(row, 'partner_id', 'partnerId')),
    category: String(val(row, 'category_name', 'categoryName', 'category')),
    title: String(val(row, 'title')),
    description: String(val(row, 'description')),
    pointsCost: Number(val(row, 'points_cost', 'pointsCost')),
    fulfillmentType: String(val(row, 'fulfillment_type', 'fulfillmentType'))
  }));
  const [selectedReward, setSelectedReward] = useState<RewardItem | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const redemptionKey = useRef('');

  const chooseReward = (item: RewardItem) => {
    redemptionKey.current = crypto.randomUUID();
    setRedeemError('');
    setSelectedReward(item);
  };

  const redeem = async () => {
    if (!selectedReward) return;
    setRedeeming(true);
    setRedeemError('');
    setSuccessMsg('');
    try {
      let linkId: string | undefined;
      if (selectedReward.fulfillmentType === 'ACCOUNT_TOPUP') {
        const links = rowsFrom<Row>(await apiGet<unknown>('/partner-links'));
        const link = links.find((item) => Number(val(item, 'partner_id', 'partnerId')) === selectedReward.partnerId && val(item, 'status') === 'ACTIVE');
        if (!link) throw new Error('Bạn cần liên kết tài khoản đối tác trước khi đổi ưu đãi nạp trực tiếp này.');
        linkId = String(val(link, 'link_id', 'linkId'));
      }
      const redemption = await apiPost<{ status: string }>('/redemptions', {
        voucherId: selectedReward.id,
        idempotencyKey: redemptionKey.current,
        linkId
      });
      if (redemption.status === 'FAILED' || redemption.status === 'CANCELLED') {
        redemptionKey.current = crypto.randomUUID();
        throw new Error('Lần đổi trước đã được hoàn điểm. Vui lòng xác nhận lại.');
      }
      setSuccessMsg('Yêu cầu đổi quà đã được ghi nhận. Điểm và voucher được đồng bộ trong tài khoản.');
      setSelectedReward(null);
      result.refresh();
      window.dispatchEvent(new Event('bravoforest:wallet-updated'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.push('/login');
        return;
      }
      setRedeemError(e instanceof Error ? e.message : 'Không thể đổi quà lúc này.');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="customer-page" style={{ background: 'var(--obsidian)', padding: '48px 24px 80px' }}>
      <FadeContent effect="fade" blur={false} duration={0.5}>
        <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto' }}>
        <div style={{ marginBottom: 40 }}>
          <h1
            className="font-display font-bold text-3xl sm:text-4xl text-[#112A1D]"
            style={{ margin: '0 0 12px', letterSpacing: '-0.03em' }}
          >
            Quà tặng
          </h1>
          <p className="font-ui text-sm sm:text-base text-[#456353]" style={{ margin: 0, lineHeight: 1.6 }}>
            Đổi điểm lấy ưu đãi từ các đối tác.
          </p>
        </div>

        <div className="customer-reward-toolbar">
          <label className="customer-machine-search">
            <Search size={17} aria-hidden="true" />
            <input type="search" placeholder="Tìm quà hoặc đối tác" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          </label>
          <div className="customer-reward-category" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#456353', letterSpacing: '0.03em' }}>
              Danh mục
            </span>
            <GlideSelect
              options={[
                { value: '', label: 'Tất cả danh mục', tag: 'Tất cả' },
                ...categories.map((c) => ({ value: c, label: c, tag: 'Ưu đãi' }))
              ]}
              value={categoryFilter}
              onChange={(val) => setCategoryFilter(val)}
              surfaceColor="#ffffff"
              highlightColor="rgba(21, 128, 61, 0.08)"
              textColor="#112A1D"
              accentColor="#15803d"
              size="md"
              radius={12}
              menuWidth={220}
              placeholder="Chọn danh mục"
            />
          </div>
        </div>

        {/* Bento Grid 3 Cols */}
        <ApiMessage
          loading={result.loading}
          error={result.error}
          empty={!catalog.length}
          emptyText={searchTerm || categoryFilter ? 'Không tìm thấy ưu đãi phù hợp.' : 'Hiện chưa có quà tặng.'}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 24
            }}
          >
            {catalog.map((item) => (
              <SpotlightCard
                key={item.id}
                theme="light"
                spotlightColor="rgba(34, 197, 94, 0.18)"
                spotlightSize={260}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(17, 42, 29, 0.08)',
                  borderRadius: 20,
                  padding: '28px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 290,
                  boxShadow: '0 8px 30px -6px rgba(21, 128, 61, 0.06)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 10px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: '#15803d',
                        background: 'rgba(21, 128, 61, 0.08)',
                        border: '1px solid rgba(21, 128, 61, 0.15)'
                      }}
                    >
                      <Sparkles size={12} />
                      <span>{item.category}</span>
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-lg text-[#112A1D] mb-2" style={{ letterSpacing: '-0.01em' }}>
                    {item.title}
                  </h3>
                  <p className="font-ui text-xs sm:text-sm text-[#456353] leading-relaxed mb-4">
                    {item.description}
                  </p>
                </div>

                <div>
                  <div
                    className="font-display font-extrabold text-2xl text-[#15803D] mb-4 rvm-tabular"
                    style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}
                  >
                    <span>{fmtNum(item.pointsCost)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#456353' }}>điểm xanh</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => chooseReward(item)}
                    className="rvm-btn-primary"
                    style={{ width: '100%', height: 44, borderRadius: 12, fontSize: 13, fontWeight: 700 }}
                  >
                    <span>Đổi quà ngay</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </SpotlightCard>
            ))}
          </div>
        </ApiMessage>
        {totalPages > 1 && (
          <nav aria-label="Phân trang quà tặng" className="customer-pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Trước</button>
            <span>Trang {page} / {totalPages} · {total.toLocaleString('vi-VN')} ưu đãi</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Tiếp</button>
          </nav>
        )}

        {/* Redemption Confirmation Modal */}
        {selectedReward && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(17, 42, 29, 0.6)',
              zIndex: 70,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24
            }}
            onClick={() => setSelectedReward(null)}
          >
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid var(--line-dark-strong)',
                padding: '40px 36px',
                maxWidth: 480,
                width: '100%'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display font-bold text-xl text-[#112A1D] mb-3">
                {selectedReward.title}
              </h2>
              <p className="font-ui text-sm text-[#456353] mb-6">
                Dùng <strong>{fmtNum(selectedReward.pointsCost)} điểm</strong> để đổi ưu đãi này. Số điểm được kiểm tra lại trong ví khi xác nhận.
              </p>

              {redeemError && <p className="customer-form-error" role="alert">{redeemError}</p>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setSelectedReward(null)}
                  className="rvm-btn-secondary"
                  style={{ height: 46, fontSize: 13 }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void redeem();
                  }}
                  disabled={redeeming}
                  className="rvm-btn-primary"
                  style={{ height: 46, fontSize: 13 }}
                >
                  {redeeming ? 'Đang xử lý…' : 'Xác nhận đổi'}
                </button>
              </div>
            </div>
          </div>
        )}

        {successMsg && (
          <div
            className="customer-auth-feedback"
            style={{ marginTop: 24 }}
          >
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}
        </div>
      </FadeContent>
    </div>
  );
}

/* =========================================================================
   PAGE 8.3: VÍ VOUCHER (/vouchers)
   ========================================================================= */

function Vouchers() {
  const result = useApi<unknown>('/redemptions');
  const rows = rowsFrom<Row>(result.data);

  return (
    <div className="customer-page" style={{ background: 'var(--obsidian)', padding: '48px 24px 80px' }}>
      <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto' }}>
        <div style={{ marginBottom: 36 }}>
          <div className="rvm-status-line" style={{ marginBottom: 12 }}>
            <span>KHO VOUCHER CỦA BẠN</span>
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-[#112A1D]" style={{ margin: '0 0 10px', letterSpacing: '-0.03em' }}>
            Voucher đã đổi
          </h1>
          <p className="font-ui text-sm sm:text-base text-[#456353]" style={{ margin: 0, lineHeight: 1.6 }}>
            Quản lý mã ưu đãi điện tử đã đổi từ các trạm máy RVM.
          </p>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid rgba(17, 42, 29, 0.08)', borderRadius: 20, padding: '32px', boxShadow: '0 8px 30px -4px rgba(21, 128, 61, 0.06)' }}>
          <ApiMessage
            loading={result.loading}
            error={result.error}
            empty={!rows.length}
            emptyText="Bạn chưa có voucher nào. Hãy đổi điểm tích lũy thành quà tặng ngay!"
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line-dark)' }}>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">THỜI GIAN ĐỔI</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">TÊN VOUCHER</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">ĐỐI TÁC</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold text-right">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line-dark)' }}>
                      <td className="font-mono text-xs text-[#456353] py-4">
                        {fmtDate(val(r, 'started_at', 'startedAt'))}
                      </td>
                      <td className="font-ui text-sm font-bold text-[#112A1D] py-4">
                        {val(r, 'title', 'voucher_title')}
                      </td>
                      <td className="font-ui text-sm text-[#456353] py-4">
                        {val(r, 'partner_name', 'partnerName')}
                      </td>
                      <td className="py-4 text-right">
                        <span className="rvm-status-line">
                          {val(r, 'status') || 'KHẢ DỤNG'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ApiMessage>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 8.4: LỊCH SỬ THU HỒI (/history)
   ========================================================================= */

function History() {
  const result = useApi<unknown>('/sessions');
  const rows = rowsFrom<Row>(result.data);

  return (
    <div className="customer-page" style={{ background: 'var(--obsidian)', padding: '48px 24px 80px' }}>
      <div style={{ maxWidth: 'var(--page-max-width)', margin: '0 auto' }}>
        <div style={{ marginBottom: 36 }}>
          <div className="rvm-status-line" style={{ marginBottom: 12 }}>
            <span>LỊCH SỬ NẠP VỎ</span>
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-[#112A1D]" style={{ margin: '0 0 10px', letterSpacing: '-0.03em' }}>
            Hành trình thu hồi bao bì
          </h1>
          <p className="font-ui text-sm sm:text-base text-[#456353]" style={{ margin: 0, lineHeight: 1.6 }}>
            Chi tiết các phiên nộp vỏ chai nhựa rPET tại các trạm máy RVM thông minh.
          </p>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid rgba(17, 42, 29, 0.08)', borderRadius: 20, padding: '32px', boxShadow: '0 8px 30px -4px rgba(21, 128, 61, 0.06)' }}>
          <ApiMessage
            loading={result.loading}
            error={result.error}
            empty={!rows.length}
            emptyText="Chưa có vỏ chai nào. Lần nạp đầu tiên của bạn sẽ hiện ở đây."
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line-dark)' }}>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">THỜI GIAN</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">MÃ PHIÊN MÁY</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold">SỐ LƯỢNG VỎ</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold text-right">ĐIỂM THƯỞNG</th>
                    <th className="font-mono text-xs text-[#456353] pb-3 font-bold text-right">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line-dark)' }}>
                      <td className="font-mono text-xs text-[#456353] py-4">
                        {fmtDate(val(r, 'created_at', 'createdAt'))}
                      </td>
                      <td className="font-mono text-xs text-[#112A1D] py-4 font-bold">
                        #{val(r, 'session_id', 'id')}
                      </td>
                      <td className="font-ui text-sm text-[#112A1D] py-4 font-semibold">
                        {val(r, 'items_accepted', 'itemsAccepted') || '0'}
                      </td>
                      <td className="font-ui text-sm font-bold text-right py-4 text-[#15803D] rvm-tabular">
                        {val(r, 'points_credited', 'pointsCredited') === '' || val(r, 'points_credited', 'pointsCredited') === null
                          ? '—'
                          : `+${fmtNum(Number(val(r, 'points_credited', 'pointsCredited')))} điểm`}
                      </td>
                      <td className="py-4 text-right">
                        <span className={`rvm-status-line ${val(r, 'status') === 'COMPLETED' ? '' : 'pending'}`}>
                          {val(r, 'status') === 'COMPLETED' ? 'HOÀN TẤT' : String(val(r, 'status') || 'ĐANG XỬ LÝ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ApiMessage>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   PAGE 8.5: HỒ SƠ THÀNH VIÊN (/profile)
   ========================================================================= */

function Profile() {
  const me = useApi<Row>('/auth/me');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage('');
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      await apiPatch('/auth/me', { fullName: fd.get('fullName'), phone: fd.get('phone') || undefined });
      setMessage('Cập nhật hồ sơ cá nhân thành công.');
      me.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể cập nhật thông tin hồ sơ.');
    }
  };

  const submitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const newPassword = String(fd.get('newPassword') || '');
    if (newPassword !== String(fd.get('confirmPassword') || '')) {
      setPasswordError('Mật khẩu mới nhập lại chưa khớp.');
      return;
    }
    setPasswordBusy(true);
    try {
      await apiPatch('/auth/password', { currentPassword: fd.get('currentPassword'), newPassword });
      form.reset();
      setPasswordMessage('Mật khẩu đã được đổi.');
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Không thể đổi mật khẩu.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const user = me.data;

  return (
    <div className="customer-page" style={{ background: 'var(--obsidian)', padding: '48px 24px 80px' }}>
      <FadeContent effect="fade" blur={false} duration={0.5}>
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <div style={{ marginBottom: 36 }}>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-[#112A1D]" style={{ margin: '0 0 10px', letterSpacing: '-0.03em' }}>
            Hồ sơ &amp; Bảo mật
          </h1>
          <p className="font-ui text-sm sm:text-base text-[#456353]" style={{ margin: 0, lineHeight: 1.6 }}>
            Quản lý thông tin định danh và tài khoản thụ hưởng điểm xanh của bạn.
          </p>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(17, 42, 29, 0.08)',
            borderRadius: 20,
            padding: '36px 32px',
            boxShadow: '0 8px 30px -4px rgba(21, 128, 61, 0.06)'
          }}
        >
          <ApiMessage loading={me.loading} error={me.error}>
            {user && (
              <form onSubmit={submit} style={{ display: 'grid', gap: 24 }}>
                <div>
                  <label className="rvm-input-label">HỌ VÀ TÊN</label>
                  <input
                    name="fullName"
                    defaultValue={val(user, 'fullName', 'full_name')}
                    required
                    className="rvm-input-underline"
                  />
                </div>

                <div>
                  <label className="rvm-input-label">SỐ ĐIỆN THOẠI</label>
                  <input
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="0[0-9]{9}"
                    maxLength={10}
                    defaultValue={val(user, 'phone')}
                    placeholder="0901234567"
                    onChange={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '').slice(0, 10); }}
                    className="rvm-input-underline"
                  />
                </div>

                <div>
                  <label className="rvm-input-label">EMAIL ĐỊNH DANH (CỐ ĐỊNH)</label>
                  <input
                    name="email"
                    defaultValue={val(user, 'email')}
                    disabled
                    className="rvm-input-underline"
                    style={{ opacity: 0.5, cursor: 'not-allowed' }}
                  />
                </div>

                <div style={{ paddingTop: 16 }}>
                  <button type="submit" className="rvm-btn-primary">
                    <span>Lưu thay đổi</span>
                    <ArrowRight size={16} />
                  </button>
                </div>

                {message && (
                  <div className="customer-form-success" role="status">
                    <Check size={16} />
                    <span>{message}</span>
                  </div>
                )}
                {error && <p className="customer-form-error" role="alert">{error}</p>}
              </form>
            )}
          </ApiMessage>
        </div>

        {user && (
          <section className="customer-security-card" style={{ marginTop: 24, borderRadius: 20 }}>
            <h2>Đổi mật khẩu</h2>
            <p>Nhập mật khẩu hiện tại để xác nhận.</p>
            <form onSubmit={submitPassword}>
              <label>MẬT KHẨU HIỆN TẠI<input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required /></label>
              <label>MẬT KHẨU MỚI<input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required /></label>
              <label>NHẬP LẠI MẬT KHẨU MỚI<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={72} required /></label>
              <button type="submit" className="rvm-btn-primary" disabled={passwordBusy}>{passwordBusy ? 'Đang lưu…' : 'Đổi mật khẩu'}</button>
            </form>
            {passwordMessage && <p className="customer-form-success" role="status"><Check size={16} />{passwordMessage}</p>}
            {passwordError && <p className="customer-form-error" role="alert">{passwordError}</p>}
          </section>
        )}
        </div>
      </FadeContent>
    </div>
  );
}

/* =========================================================================
   PAGE 8.6: MACHINE LOGIN (KIOSK SESSION CLAIM /machine-login)
   ========================================================================= */

function MachineLogin() {
  return (
    <div
      className="customer-page"
      style={{
        position: 'relative',
        background: 'radial-gradient(ellipse at 50% 10%, #0d281a 0%, #05130b 60%, #020804 100%)',
        padding: '64px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 64px)',
        overflow: 'hidden'
      }}
    >
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <LightRays
          raysOrigin="top-center"
          raysColor="#ffffff"
          raysSpeed={0.8}
          lightSpread={0.4}
          rayLength={2.6}
          glow={0.6}
          haze={0.2}
        />
      </div>

      <AnimatedContent distance={30} duration={0.65} ease="power3.out">
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 440,
            width: '100%',
            background: '#FFFFFF',
            border: '1px solid var(--line-dark)',
            padding: '36px 32px 40px',
            textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)'
          }}
        >
          <div style={{ height: 110, width: 140, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ElectricLogo
              src="/icon.png"
              color="#86efac"
              glowColor="#22c55e"
              scale={0.58}
              speed={1.6}
              style={{ width: '100%', height: '100%' }}
            />
          </div>

          <span className="font-mono text-xs uppercase tracking-wider text-[#15803D] font-bold block mb-2">
            LIÊN KẾT PHIÊN TẠI MÁY
          </span>
          <h1 className="font-display font-bold text-2xl text-[#112A1D] mb-3">
            Quét QR tại máy RVM
          </h1>
          <p className="font-ui text-sm text-[#456353] mb-6">
            Đăng nhập tài khoản BravoForest rồi quét mã QR đang hiển thị trên màn hình máy để liên kết phiên gửi với ví của bạn.
          </p>

          <div style={{ display: 'grid', gap: 14 }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('bravoforest:open-qr-scanner'))}
              className="rvm-btn-secondary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Scan size={16} />
              <span>Mở camera quét QR</span>
            </button>
            <Link href="/wallet" className="rvm-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
              Quay lại ví điểm
            </Link>
          </div>
        </div>
      </AnimatedContent>
    </div>
  );
}

/* =========================================================================
   PAGE ROUTER DISPATCHER
   ========================================================================= */

export function CustomerPage({ route }: { route: string }) {
  if (route === 'home' || route === '') return <Landing />;
  if (route === 'login') return <Auth />;
  if (route === 'register') return <Auth register />;
  if (route === 'forgot-password') return <Auth forgot />;
  if (route === 'wallet' || route === 'vi') return <Wallet />;
  if (route === 'history' || route === 'vi/lich-su') return <History />;
  if (route === 'machines' || route === 'tim-may' || route === 'machines/detail') return <Machines />;
  if (route === 'rewards' || route === 'qua-tang' || route === 'vi/qua-tang') return <Rewards />;
  if (route === 'vouchers') return <Vouchers />;
  if (route === 'profile' || route === 'vi/ho-so') return <Profile />;
  if (route === 'machine-login') return <MachineLogin />;

  // 404 Not Found (Light Environmental Style)
  return (
    <div className="customer-page"
      style={{
        background: 'var(--obsidian)',
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        textAlign: 'center'
      }}
    >
      <div
        style={{
          maxWidth: 480,
          background: '#FFFFFF',
          border: '1px solid var(--line-dark)',
          padding: '48px 36px'
        }}
      >
        <span className="font-mono text-xs uppercase text-[#15803D] font-bold tracking-widest block mb-2">
          LỖI 404
        </span>
        <h1 className="font-display font-bold text-2xl text-[#112A1D] mb-3">
          Máy này chưa có ở đây.
        </h1>
        <p className="font-ui text-sm text-[#456353] mb-6">
          Trang bạn tìm kiếm không tồn tại hoặc đã được chuyển sang địa chỉ mới.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          <Link href="/" className="rvm-btn-primary">
            <span>Về trang chủ</span>
            <ArrowRight size={16} />
          </Link>
          <Link href="/machines" className="rvm-btn-secondary">
            <span>Tìm máy gần bạn</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
