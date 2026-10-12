import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#071910', color: '#ffffff', padding: 24, textAlign: 'center' }}>
      <div className="tomorro-auth-card" style={{ maxWidth: 480 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, textTransform: 'uppercase', margin: '0 0 10px', color: '#ffffff' }}>
          Page Not Found
        </h1>
        <p style={{ color: '#9db4a6', fontSize: 14.5, marginBottom: 24 }}>
          The page or terminal resource you requested does not exist or has moved.
        </p>
        <Link href="/" className="btn-tomorro-lime" style={{ display: 'inline-flex', justifyContent: 'center' }}>
          Return to Home ↗
        </Link>
      </div>
    </main>
  );
}
