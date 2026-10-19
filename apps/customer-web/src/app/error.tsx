'use client';

export default function ErrorState({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="customer-state-page" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#071910', color: '#ffffff', padding: 24, textAlign: 'center' }}>
      <div className="customer-state-card" style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 30, textTransform: 'uppercase', lineHeight: 1.25, margin: '0 0 10px', color: '#ffffff' }}>
          Hệ thống tạm thời gián đoạn
        </h2>
        <p style={{ color: '#9db4a6', fontSize: 14.5, marginBottom: 24 }}>
          Đã xảy ra lỗi không mong muốn. Vui lòng thử tải lại trang.
        </p>
        <button className="btn-tomorro-lime" style={{ width: '100%', justifyContent: 'center' }} onClick={reset}>
          Thử lại phiên kết nối ↗
        </button>
      </div>
    </main>
  );
}
