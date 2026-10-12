'use client';

import { useState, useEffect } from 'react';

const steps = [
  { id: 0, title: 'Khởi động' },
  { id: 1, title: 'Tích điểm' },
  { id: 2, title: 'Liên kết' },
  { id: 3, title: 'Nạp bao bì' },
  { id: 4, title: 'Xác nhận' },
  { id: 5, title: 'Hoàn tất' }
];

export default function Kiosk() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'member' | 'guest'>('guest');
  const [items, setItems] = useState(0);
  const [time, setTime] = useState('');
  const [recentFeed, setRecentFeed] = useState<Array<{ type: string; points: number }>>([]);

  // Real-time kiosk digital clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const addItem = (type: 'PET' | 'CAN') => {
    setItems((c) => c + 1);
    setRecentFeed((prev) => [
      {
        type: type === 'PET' ? 'Chai nhựa PET 500ml · Hợp lệ' : 'Lon nhôm 330ml · Hợp lệ',
        points: 10
      },
      ...prev.slice(0, 3)
    ]);
  };

  const removeItem = () => {
    setItems((c) => Math.max(0, c - 1));
    setRecentFeed((prev) => prev.slice(1));
  };

  const restart = () => {
    setStep(0);
    setMode('guest');
    setItems(0);
    setRecentFeed([]);
  };

  const pointsEarned = items * 10;
  const weightKg = (items * 0.025).toFixed(2);
  const co2Avoided = (items * 0.035).toFixed(2);

  return (
    <main className="kiosk-shell">
      <div className="kiosk-screen">
        {/* TOP STATUS BAR (HARDWARE TELEMETRY) */}
        <header className="kiosk-header">
          <div className="kiosk-station-id">
            <span className="kiosk-status-dot" />
            <div>
              <div className="kiosk-station-title">TRẠM THU GOM RVM-HN-042</div>
              <div className="kiosk-station-location">Vincom Mega Mall · Trực tuyến</div>
            </div>
          </div>

          <div className="kiosk-telemetry-pill">
            <span>CẢM BIẾN QUANG: SẴN SÀNG</span>
            <span>·</span>
            <span>THÙNG NÉN: 38% TRỐNG</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="kiosk-clock">{time || '12:00'}</span>
            <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.08)', padding: '5px 10px', borderRadius: 6, fontWeight: 700 }}>
              TIẾNG VIỆT
            </span>
          </div>
        </header>

        {/* STEP PROGRESS INDICATOR */}
        <div className="kiosk-progress-bar">
          {steps.map((s, idx) => {
            const isActive = s.id === step;
            const isDone = s.id < step;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={`kiosk-progress-step ${isActive ? 'active' : isDone ? 'done' : ''}`}>
                  <span className="kiosk-progress-num">{idx + 1}</span>
                  <span>{s.title}</span>
                </div>
                {idx < steps.length - 1 && (
                  <span className={`kiosk-progress-divider ${isDone ? 'done' : ''}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* MAIN TOUCH CONTENT */}
        <div className="kiosk-main">
          <div className="kiosk-content" key={step}>
            {/* STEP 0: IDLE / WELCOME */}
            {step === 0 && (
              <>
                <div className="kiosk-aperture-wrap">
                  <div className="kiosk-aperture-portal">
                    <div className="kiosk-aperture-core">♻</div>
                  </div>
                </div>

                <h1 className="kiosk-title">
                  TRẠM THU GOM &amp; PHÂN LOẠI <br />
                  <span className="text-highlight">BAO BÌ TỰ ĐỘNG</span>
                </h1>

                <p className="kiosk-copy">
                  Đổi vỏ chai nhựa PET và lon nhôm lấy điểm thưởng xanh hoặc phiếu mua sắm tức thì. Chung tay vì một tương lai không rác thải.
                </p>

                <div className="kiosk-materials-row">
                  <div className="kiosk-material-card">
                    <div className="kiosk-material-icon">🍾</div>
                    <div className="kiosk-material-info">
                      <h3>Chai nhựa PET</h3>
                      <p>Dung tích 330ml – 1.5L, còn nguyên tem nhãn barcode, không chứa chất lỏng.</p>
                    </div>
                  </div>

                  <div className="kiosk-material-card">
                    <div className="kiosk-material-icon">🥫</div>
                    <div className="kiosk-material-info">
                      <h3>Lon nhôm</h3>
                      <p>Lon nước ngọt, bia nguyên vẹn, rỗng, sạch sẽ và không bị bẹp hoàn toàn.</p>
                    </div>
                  </div>
                </div>

                <div className="kiosk-actions">
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    style={{ minWidth: 340, fontSize: 20 }}
                    onClick={() => setStep(1)}
                  >
                    CHẠM ĐỂ BẮT ĐẦU GỬI BAO BÌ ↗
                  </button>
                </div>
              </>
            )}

            {/* STEP 1: CHỌN PHƯƠNG THỨC TÍCH ĐIỂM */}
            {step === 1 && (
              <>
                <h1 className="kiosk-title">
                  CHỌN PHƯƠNG THỨC <br />
                  <span className="text-highlight">NHẬN ĐIỂM THƯỞNG</span>
                </h1>
                <p className="kiosk-copy">
                  Bạn có thể tích lũy điểm vào ví thành viên BravoForest hoặc in phiếu mã quà tặng trực tiếp tại máy.
                </p>

                <div className="kiosk-choice-grid">
                  <div
                    tabIndex={0}
                    className="kiosk-choice-card"
                    onClick={() => {
                      setMode('member');
                      setStep(2);
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
                      <h2>Tài khoản Thành viên</h2>
                      <p>Quét mã QR trên điện thoại để tích điểm vào ví cá nhân và đổi voucher đối tác trên ứng dụng.</p>
                    </div>
                    <button className="btn-kiosk-touch btn-kiosk-lime" style={{ width: '100%' }}>
                      Quét mã QR Thành viên ↗
                    </button>
                  </div>

                  <div
                    tabIndex={0}
                    className="kiosk-choice-card"
                    onClick={() => {
                      setMode('guest');
                      setStep(3);
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🎫</div>
                      <h2>Giao dịch tại chỗ</h2>
                      <p>Không cần đăng nhập tài khoản. Máy sẽ in phiếu mã giảm giá trực tiếp sau khi hoàn tất phiên.</p>
                    </div>
                    <button className="btn-kiosk-touch btn-kiosk-dark" style={{ width: '100%' }}>
                      Gửi bao bì ngay (In phiếu) ↗
                    </button>
                  </div>
                </div>

                <button
                  className="btn-kiosk-touch btn-kiosk-outline"
                  onClick={() => setStep(0)}
                  style={{ minWidth: 200 }}
                >
                  ← Quay lại màn hình chính
                </button>
              </>
            )}

            {/* STEP 2: QUÉT MÃ QR THÀNH VIÊN */}
            {step === 2 && mode === 'member' && (
              <>
                <h1 className="kiosk-title">
                  QUÉT MÃ QR <br />
                  <span className="text-highlight">TÀI KHOẢN THÀNH VIÊN</span>
                </h1>
                <p className="kiosk-copy">
                  Mở ứng dụng hoặc trang cá nhân BravoForest trên điện thoại, đưa mã QR trước đầu đọc bên dưới màn hình.
                </p>

                <div className="kiosk-scanner-box">
                  <div className="kiosk-laser-line" />
                  <div style={{ textAlign: 'center', color: '#9db4a6' }}>
                    <div style={{ fontSize: 56, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#2fe07a' }}>
                      ĐANG CHỜ QUÉT MÃ QR...
                    </div>
                    <div style={{ fontSize: 11, color: '#688975', marginTop: 4 }}>
                      CẢM BIẾN CAMERA HOẠT ĐỘNG
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                  <button
                    className="btn-kiosk-touch btn-kiosk-outline"
                    onClick={() => setStep(1)}
                  >
                    ← Đổi phương thức
                  </button>
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    onClick={() => setStep(3)}
                    style={{ minWidth: 260 }}
                  >
                    Xác nhận kết nối &amp; Tiếp tục →
                  </button>
                </div>
              </>
            )}

            {/* STEP 3: NẠP BAO BÌ VÀO MÁY (LIVE HARDWARE INTERACTION) */}
            {step === 3 && (
              <>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(47,224,122,0.15)', border: '1px solid rgba(47,224,122,0.3)', padding: '6px 16px', borderRadius: 9999, color: '#2fe07a', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                  <span className="kiosk-status-dot" style={{ width: 8, height: 8 }} />
                  KHAY NẠP ĐANG MỞ · CẢM BIẾN QUANG HỌC HOẠT ĐỘNG
                </div>

                <h1 className="kiosk-title" style={{ margin: '4px 0 16px' }}>
                  ĐƯA BAO BÌ VÀO <span className="text-highlight">KHAY NHẬN</span>
                </h1>

                {/* REAL-TIME HARDWARE METRICS CONSOLE */}
                <div className="kiosk-infeed-dashboard">
                  <div className="kiosk-infeed-metrics">
                    <div className="kiosk-metric-box">
                      <div className="label">Số lượng đã nhận</div>
                      <div className="number">{items}</div>
                      <div className="unit">Đơn vị hợp lệ</div>
                    </div>
                    <div className="kiosk-metric-box">
                      <div className="label">Điểm thưởng</div>
                      <div className="number" style={{ color: 'var(--kiosk-accent)' }}>+{pointsEarned}</div>
                      <div className="unit">Green Points</div>
                    </div>
                    <div className="kiosk-metric-box">
                      <div className="label">Khối lượng thu gom</div>
                      <div className="number">{weightKg}</div>
                      <div className="unit">Kilogram (kg)</div>
                    </div>
                    <div className="kiosk-metric-box">
                      <div className="label">Giảm phát thải</div>
                      <div className="number">{co2Avoided}</div>
                      <div className="unit">kg CO₂ tương đương</div>
                    </div>
                  </div>

                  {/* RECENT INFEED CONTAINER STREAM */}
                  <div className="kiosk-container-stream">
                    {recentFeed.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#688975', padding: '12px 0', fontSize: 13 }}>
                        Chưa có vật liệu nào được đưa vào. Vui lòng nạp từng vỏ chai hoặc lon.
                      </div>
                    ) : (
                      recentFeed.map((item, i) => (
                        <div key={i} className="kiosk-stream-item">
                          <span style={{ color: '#ffffff' }}>✓ {item.type}</span>
                          <strong style={{ color: '#2fe07a' }}>+{item.points} pts</strong>
                        </div>
                      ))
                    )}
                  </div>

                  {/* HARDWARE TOUCH INPUT CONTROLS */}
                  <div className="kiosk-infeed-buttons">
                    <button
                      className="btn-kiosk-touch btn-kiosk-dark"
                      onClick={() => addItem('PET')}
                    >
                      ＋ Nạp chai nhựa PET (+1)
                    </button>
                    <button
                      className="btn-kiosk-touch btn-kiosk-dark"
                      onClick={() => addItem('CAN')}
                    >
                      ＋ Nạp lon nhôm (+1)
                    </button>
                    <button
                      className="btn-kiosk-touch btn-kiosk-outline"
                      onClick={removeItem}
                      disabled={items === 0}
                      style={{ opacity: items === 0 ? 0.4 : 1 }}
                    >
                      − Hủy bao bì lỗi (-1)
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                  <button
                    className="btn-kiosk-touch btn-kiosk-outline"
                    onClick={() => setStep(1)}
                  >
                    ← Quay lại
                  </button>
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    onClick={() => setStep(4)}
                    disabled={items === 0}
                    style={{ minWidth: 320, opacity: items === 0 ? 0.4 : 1, cursor: items === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    HOÀN TẤT &amp; IN PHIẾU NHẬN ({items}) →
                  </button>
                </div>
              </>
            )}

            {/* STEP 4: TÓM TẮT PHIÊN GỬI & BIÊN NHẬN */}
            {step === 4 && (
              <>
                <h1 className="kiosk-title">
                  XÁC NHẬN <span className="text-highlight">KẾT QUẢ PHIÊN GỬI</span>
                </h1>
                <p className="kiosk-copy">
                  Vui lòng kiểm tra lại số lượng vật liệu trước khi hoàn tất giao dịch và nhận phiếu.
                </p>

                <div className="kiosk-receipt-box">
                  <div className="kiosk-receipt-head">
                    <div>
                      <h3>BIÊN NHẬN THU GOM RVM</h3>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                        Trạm: RVM-HN-042 (Vincom Mega Mall)
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12, background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: 9999, fontWeight: 700 }}>
                        #SES-88294
                      </span>
                    </div>
                  </div>

                  <div className="kiosk-receipt-row">
                    <span>Phương thức nhận thưởng:</span>
                    <strong>{mode === 'member' ? 'Tài khoản Thành viên' : 'In phiếu quà tặng tại chỗ'}</strong>
                  </div>
                  <div className="kiosk-receipt-row">
                    <span>Tổng số lượng bao bì:</span>
                    <strong>{items} đơn vị</strong>
                  </div>
                  <div className="kiosk-receipt-row">
                    <span>Tổng khối lượng thu gom:</span>
                    <strong>{weightKg} kg</strong>
                  </div>
                  <div className="kiosk-receipt-row">
                    <span>Giảm phát thải CO₂ tương đương:</span>
                    <strong>{co2Avoided} kg CO₂</strong>
                  </div>

                  <div className="kiosk-receipt-total">
                    <span>ĐIỂM THƯỞNG TÍCH LŨY:</span>
                    <span>+{pointsEarned} ECO POINTS</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                  <button
                    className="btn-kiosk-touch btn-kiosk-outline"
                    onClick={() => setStep(3)}
                  >
                    ← Tiếp tục nạp thêm
                  </button>
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    onClick={() => setStep(5)}
                    style={{ minWidth: 320 }}
                  >
                    XÁC NHẬN &amp; HOÀN TẤT GIAO DỊCH →
                  </button>
                </div>
              </>
            )}

            {/* STEP 5: HOÀN TẤT & CẢM ƠN */}
            {step === 5 && (
              <>
                <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'linear-gradient(135deg, #2fe07a 0%, #15733f 100%)', color: '#05140d', display: 'grid', placeItems: 'center', fontSize: 52, fontWeight: 900, margin: '0 auto 20px', boxShadow: '0 0 50px rgba(47,224,122,0.5)' }}>
                  ✓
                </div>

                <h1 className="kiosk-title">
                  GIAO DỊCH <span className="text-highlight">THÀNH CÔNG!</span>
                </h1>

                <p className="kiosk-copy">
                  {mode === 'member'
                    ? `Hệ thống đã cộng thành công +${pointsEarned} điểm thưởng vào ví BravoForest của bạn.`
                    : 'Phiếu quà tặng kèm mã barcode đang được in tại khe nhận bên dưới màn hình. Vui lòng nhận phiếu.'}
                </p>

                <div style={{ background: 'rgba(47,224,122,0.12)', border: '1px solid rgba(47,224,122,0.3)', borderRadius: 20, padding: '20px 28px', maxWidth: 620, margin: '0 auto 36px', color: '#c4dcd0', fontSize: 16 }}>
                  🌱 Hành động của bạn đã giúp giữ cho môi trường xanh hơn và ngăn chặn {co2Avoided} kg CO₂ phát thải!
                </div>

                <div className="kiosk-actions">
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    onClick={restart}
                    style={{ minWidth: 320 }}
                  >
                    THỰC HIỆN GIAO DỊCH MỚI
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* BOTTOM SAFETY & SUPPORT BAR */}
        <footer className="kiosk-foot">
          <div>
            <span>Tổng đài hỗ trợ: <strong>1900 6868</strong></span>
            <span style={{ margin: '0 12px', opacity: 0.4 }}>|</span>
            <span>support@bravoforest.vn</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>Kiosk Terminal OS v2.4.1 (Stable)</span>
            <button className="kiosk-reset-link" onClick={restart}>
              Hủy phiên / Bắt đầu lại
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
