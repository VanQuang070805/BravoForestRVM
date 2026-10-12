export default function Loading() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#071910', color: '#ffffff' }}>
      <div className="tomorro-auth-card" style={{ maxWidth: 380, textAlign: 'center', padding: '32px 24px' }}>
        <div style={{ color: 'var(--tomorro-fluo-green)', fontSize: 32, marginBottom: 12 }}>✳</div>
        <strong style={{ display: 'block', fontSize: 16, color: '#ffffff', marginBottom: 6 }}>Loading BravoForest…</strong>
        <p style={{ color: '#8da495', fontSize: 13, margin: 0 }}>Connecting to BravoForest circular ledger</p>
      </div>
    </main>
  );
}
