import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="customer-state-page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#071910', color: '#ffffff', padding: 24, textAlign: 'center' }}>
      <div className="customer-state-card" style={{ maxWidth: 480 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, textTransform: 'uppercase', lineHeight: 1.25, margin: '0 0 10px', color: '#ffffff' }}>
          Không tìm thấy trang
        </h1>
        <p style={{ color: '#9db4a6', fontSize: 14.5, marginBottom: 24 }}>
          Trang hoặc tài nguyên bạn yêu cầu không tồn tại hoặc đã được di chuyển.
        </p>
        <Link href="/" className="btn-tomorro-lime" style={{ display: 'inline-flex', justifyContent: 'center' }}>
          Quay về Trang chủ ↗
        </Link>
      </div>
    </main>
  );
}
