'use client';

export default function ErrorState({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#071910', color: '#ffffff', padding: 24, textAlign: 'center' }}>
      <div className="tomorro-auth-card" style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px', color: '#ffffff' }}>
          System Temporarily Unavailable
        </h2>
        <p style={{ color: '#9db4a6', fontSize: 14.5, marginBottom: 24 }}>
          An unexpected error occurred. Please try reloading.
        </p>
        <button className="btn-tomorro-lime" style={{ width: '100%', justifyContent: 'center' }} onClick={reset}>
          Retry Session ↗
        </button>
      </div>
    </main>
  );
}
