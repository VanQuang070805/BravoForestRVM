'use client';

import { useState, useEffect } from 'react';
import QRCodeGenerator from 'qrcode';

type ScanOption = {
  rule_id: number;
  container_type_id: number;
  container_name: string;
  volume_ml: number | null;
  material_code: string;
  material_name: string;
  points_per_item: number;
};

type MachineInfo = {
  machine_code: string;
  location_name: string;
  address: string;
  ward?: string | null;
  district?: string | null;
  city?: string | null;
};

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
  const [pointsEarned, setPointsEarned] = useState(0);
  const [finalPoints, setFinalPoints] = useState<number | null>(null);
  const [time, setTime] = useState('');
  const [recentFeed, setRecentFeed] = useState<Array<{ type: string; points: number; accepted: boolean }>>([]);
  const [sessionId, setSessionId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [sessionQr, setSessionQr] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState(0);
  const [qrSeconds, setQrSeconds] = useState(0);
  const [scannerError, setScannerError] = useState('');
  const [linking, setLinking] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [scanOptions, setScanOptions] = useState<ScanOption[]>([]);
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);

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

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('bravoforest-rvm-session');
      if (saved) {
        const session = JSON.parse(saved) as {
          sessionId?: string; sessionToken?: string; sessionQr?: string; qrExpiresAt?: number; mode?: 'member' | 'guest';
          step?: number; items?: number; pointsEarned?: number; finalPoints?: number | null;
        };
        if (/^\d{1,20}$/.test(session.sessionId ?? '') && /^[a-f0-9]{64}$/i.test(session.sessionToken ?? '')) {
          setSessionId(session.sessionId!);
          setSessionToken(session.sessionToken!);
          setSessionQr(session.sessionQr ?? '');
          setQrExpiresAt(Number(session.qrExpiresAt ?? 0));
          setMode(session.mode === 'member' ? 'member' : 'guest');
          setStep([2, 3, 4, 5].includes(Number(session.step)) ? Number(session.step) : 3);
          setItems(Number(session.items ?? 0));
          setPointsEarned(Number(session.pointsEarned ?? 0));
          setFinalPoints(session.finalPoints == null ? null : Number(session.finalPoints));
        }
      }
    } catch {
      sessionStorage.removeItem('bravoforest-rvm-session');
    }
    setSessionRestored(true);
  }, []);

  useEffect(() => {
    if (!sessionRestored) return;
    if (!sessionId || !sessionToken || step < 2) {
      sessionStorage.removeItem('bravoforest-rvm-session');
      return;
    }
    sessionStorage.setItem('bravoforest-rvm-session', JSON.stringify({
      sessionId, sessionToken, sessionQr, qrExpiresAt, mode, step, items, pointsEarned, finalPoints,
    }));
  }, [sessionRestored, sessionId, sessionToken, sessionQr, qrExpiresAt, mode, step, items, pointsEarned, finalPoints]);

  useEffect(() => {
    let active = true;
    fetch('/kiosk/machine?catalog=1', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Không tải được cấu hình máy.');
        if (active) {
          setMachine(result.machine ?? null);
          setScanOptions(Array.isArray(result.items) ? result.items : []);
        }
      })
      .catch((error) => {
        if (active) setCatalogError(error instanceof Error ? error.message : 'Không tải được cấu hình máy.');
      })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  const createSession = async (requestedMode: 'MEMBER' | 'GUEST') => {
    setScannerError('');
    setLinking(true);
    try {
      const response = await fetch('/kiosk/machine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', mode: requestedMode })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Không thể mở phiên tại máy.');
      if (!/^\d{1,20}$/.test(String(result.sessionId ?? ''))) {
        throw new Error('Máy không nhận được mã đăng nhập hợp lệ từ API.');
      }
      if (!/^[a-f0-9]{64}$/i.test(String(result.statusToken ?? ''))) {
        throw new Error('Máy không nhận được mã phiên an toàn từ API.');
      }
      setSessionId(String(result.sessionId));
      setSessionToken(String(result.statusToken));
      setItems(0);
      setPointsEarned(0);
      setFinalPoints(null);
      setRecentFeed([]);
      setMode(requestedMode === 'MEMBER' ? 'member' : 'guest');
      if (requestedMode === 'GUEST') {
        setSessionQr('');
        setStep(3);
        return;
      }
      if (!/^[a-f0-9]{64}$/i.test(String(result.qrToken ?? ''))) {
        throw new Error('Máy không nhận được mã đăng nhập hợp lệ từ API.');
      }
      const expiresIn = Number(result.expiresInSeconds ?? 120);
      const qr = await QRCodeGenerator.toDataURL(String(result.qrToken), {
        width: 256,
        margin: 2,
        color: { dark: '#0b2e1d', light: '#ffffff' },
        errorCorrectionLevel: 'Q'
      });
      setSessionQr(qr);
      setQrExpiresAt(Date.now() + expiresIn * 1000);
      setQrSeconds(expiresIn);
      setStep(2);
    } catch (error) {
      setScannerError(error instanceof Error ? error.message : 'Không thể mở phiên tại máy.');
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    if (![2, 3, 4].includes(step) || !sessionId) return;
    let stopped = false;
    let checking = false;
    const checkStatus = async () => {
      if (stopped || checking) return;
      checking = true;
      try {
        const response = await fetch('/kiosk/machine', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'status', sessionId, statusToken: sessionToken }),
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Không thể kiểm tra trạng thái đăng nhập.');
        setItems(Number(result.acceptedItems ?? 0));
        setPointsEarned(Number(result.points ?? 0));
        setRecentFeed(Array.isArray(result.recentItems) ? result.recentItems.map((item: { item_name?: string; points?: number; accepted?: boolean }) => ({
          type: item.item_name || 'Bao bì', points: Number(item.points || 0), accepted: Boolean(item.accepted),
        })) : []);
        if (step === 2 && result.linked && result.status === 'DEPOSITING') {
          setScannerError('');
          setStep(3);
        } else if (result.expired || result.status === 'EXPIRED') {
          setScannerError('Mã QR đã hết hạn. Hãy tạo mã mới để tiếp tục.');
        } else if (result.status === 'PROCESSING' && step < 4) {
          setStep(4);
        } else if (result.status === 'COMPLETED' && step < 5) {
          setFinalPoints(Number(result.points ?? 0));
          setStep(5);
        }
      } catch (error) {
        if (!stopped) setScannerError(error instanceof Error ? error.message : 'Không thể kiểm tra trạng thái đăng nhập.');
      } finally {
        checking = false;
      }
    };
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 1800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [step, sessionId, sessionToken]);

  useEffect(() => {
    if (step !== 2 || !qrExpiresAt) return;
    const updateCountdown = () => setQrSeconds(Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000)));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [step, qrExpiresAt]);

  const cancelPendingQrSession = () => {
    if (step !== 2 || !sessionId || !sessionToken) return;
    void fetch('/kiosk/machine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', sessionId, statusToken: sessionToken }),
    }).catch(() => undefined);
  };

  const clearSession = () => {
    setSessionId('');
    setSessionToken('');
    setSessionQr('');
    setQrExpiresAt(0);
    setQrSeconds(0);
    setItems(0);
    setPointsEarned(0);
    setFinalPoints(null);
    setRecentFeed([]);
    setScannerError('');
  };

  const restart = () => {
    cancelPendingQrSession();
    setStep(0);
    setMode('guest');
    clearSession();
  };

  const changeMethod = () => {
    cancelPendingQrSession();
    clearSession();
    setStep(1);
  };

  const stationAddress = machine ? [machine.address, machine.ward, machine.district, machine.city].filter(Boolean).join(', ') : '';

  return (
    <main className="kiosk-shell">
      <div className="kiosk-screen">
        {/* TOP STATUS BAR */}
        <header className="kiosk-header">
          <div className="kiosk-station-id">
            <span className="kiosk-status-dot" style={{ opacity: machine ? 1 : 0.4 }} />
            <div>
              <div className="kiosk-station-title">{machine ? `TRẠM ${machine.machine_code}` : 'TRẠM RVM'}</div>
              <div className="kiosk-station-location">{machine ? `${machine.location_name} · ${stationAddress}` : 'Đang tải thông tin trạm'}</div>
            </div>
          </div>

          <div className="kiosk-telemetry-pill">
            <span>{machine ? 'DỮ LIỆU MÁY ĐÃ ĐỒNG BỘ' : 'ĐANG KẾT NỐI API'}</span>
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
                  Trạm thu gom &amp; phân loại <br />
                  bao bì tự động
                </h1>

                <p className="kiosk-copy">
                  Gửi bao bì được máy hỗ trợ để lưu phiên thu gom và nhận điểm thưởng vào ví BravoForest.
                </p>

                <div className="kiosk-materials-row">
                  {catalogLoading ? <div className="kiosk-material-card"><div className="kiosk-material-info"><h3>Đang tải danh sách bao bì…</h3></div></div> :
                    Array.from(new Map(scanOptions.map((option) => [option.material_code, option])).values()).map((option) => (
                      <div className="kiosk-material-card" key={option.material_code}>
                        <div className="kiosk-material-icon">♻</div>
                        <div className="kiosk-material-info">
                          <h3>{option.material_name}</h3>
                          <p>{scanOptions.filter((item) => item.material_code === option.material_code).map((item) => item.container_name).join(' · ')}</p>
                        </div>
                      </div>
                    ))}
                </div>
                {catalogError && <p className="kiosk-scanner-error" role="alert">{catalogError}</p>}

                <div className="kiosk-actions">
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    style={{ minWidth: 340, fontSize: 20 }}
                    onClick={() => setStep(1)}
                  >
                    Chạm để bắt đầu gửi bao bì
                  </button>
                </div>
              </>
            )}

            {/* STEP 1: CHỌN PHƯƠNG THỨC TÍCH ĐIỂM */}
            {step === 1 && (
              <>
                <h1 className="kiosk-title">
                  Chọn phương thức <br />
                  nhận điểm thưởng
                </h1>
                <p className="kiosk-copy">
                  Đăng nhập bằng QR để cộng điểm vào ví, hoặc gửi dưới dạng khách mà không nhận điểm vào tài khoản.
                </p>

                <div className="kiosk-choice-grid">
                  <div
                    tabIndex={0}
                    className="kiosk-choice-card"
                    onClick={() => void createSession('MEMBER')}
                  >
                    <div>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
                      <h2>Tài khoản Thành viên</h2>
                      <p>Quét mã QR trên điện thoại để tích điểm vào ví cá nhân và đổi voucher đối tác trên ứng dụng.</p>
                    </div>
                    <button disabled={linking} className="btn-kiosk-touch btn-kiosk-lime" style={{ width: '100%' }}>
                      {linking ? 'Đang mở phiên…' : 'Hiện QR đăng nhập'}
                    </button>
                  </div>

                  <div
                    tabIndex={0}
                    className="kiosk-choice-card"
                    onClick={() => void createSession('GUEST')}
                  >
                    <div>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🎫</div>
                      <h2>Giao dịch tại chỗ</h2>
                      <p>Không cần đăng nhập. Phiên gửi vẫn được lưu trong hệ thống; điểm không cộng vào ví.</p>
                    </div>
                    <button className="btn-kiosk-touch btn-kiosk-dark" style={{ width: '100%' }}>
                      {linking ? 'Đang mở phiên…' : 'Gửi bao bì dưới dạng khách'}
                    </button>
                  </div>
                </div>

                {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}

                <button
                  className="btn-kiosk-touch btn-kiosk-outline"
                  onClick={() => setStep(0)}
                  style={{ minWidth: 200 }}
                >
                  Quay lại màn hình chính
                </button>
              </>
            )}

            {/* STEP 2: HIỂN THỊ MÃ QR ĐỂ ĐIỆN THOẠI ĐĂNG NHẬP */}
            {step === 2 && mode === 'member' && (
              <>
                <h1 className="kiosk-title">
                  Quét mã để đăng nhập
                </h1>
                <p className="kiosk-copy">
                  Mở BravoForest trên điện thoại đã đăng nhập, chọn “Quét QR tại máy” và quét mã này. Máy sẽ tự kết nối với đúng tài khoản của bạn.
                </p>

                <div style={{ display: 'grid', justifyItems: 'center', gap: 12, margin: '18px auto 22px' }}>
                  <div style={{ width: 276, height: 276, display: 'grid', placeItems: 'center', padding: 10, background: '#fff', borderRadius: 18, boxShadow: '0 12px 36px rgba(0,0,0,.24)' }}>
                    {sessionQr ? <img src={sessionQr} width="256" height="256" alt="Mã QR đăng nhập máy RVM" /> : <span>Đang tạo mã QR…</span>}
                  </div>
                  <span className="kiosk-scanner-status">{qrSeconds > 0 ? `MÃ CÓ HIỆU LỰC ${qrSeconds} GIÂY` : 'MÃ QR ĐÃ HẾT HẠN'}</span>
                </div>

                {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}

                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    onClick={() => void createSession('MEMBER')}
                    disabled={linking || qrSeconds > 0}
                  >
                    {linking ? 'Đang tạo mã…' : 'Tạo mã QR mới'}
                  </button>
                  <button
                    className="btn-kiosk-touch btn-kiosk-outline"
                    onClick={changeMethod}
                  >
                    Đổi phương thức
                  </button>
                </div>
              </>
            )}

            {/* STEP 3: NẠP BAO BÌ VÀO MÁY (LIVE HARDWARE INTERACTION) */}
            {step === 3 && (
              <>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(47,224,122,0.15)', border: '1px solid rgba(47,224,122,0.3)', padding: '6px 16px', borderRadius: 9999, color: '#2fe07a', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                  <span className="kiosk-status-dot" style={{ width: 8, height: 8 }} />
                  PHIÊN GỬI ĐÃ ĐƯỢC MỞ TRÊN HỆ THỐNG
                </div>

                <h1 className="kiosk-title" style={{ margin: '4px 0 16px' }}>
                  Đưa bao bì vào khay nhận
                </h1>

                <div className="kiosk-infeed-dashboard">
                  <div className="kiosk-infeed-metrics">
                    <div className="kiosk-metric-box">
                      <div className="label">Số lượng đã nhận</div>
                      <div className="number">{items}</div>
                      <div className="unit">Đơn vị hợp lệ</div>
                    </div>
                    <div className="kiosk-metric-box">
                      <div className="label">Điểm theo quy tắc hiện hành</div>
                      <div className="number" style={{ color: 'var(--kiosk-accent)' }}>+{pointsEarned}</div>
                      <div className="unit">Điểm dự kiến · chốt từ máy chủ khi hoàn tất</div>
                    </div>
                  </div>

                  {/* RECENT INFEED CONTAINER STREAM */}
                  <div className="kiosk-container-stream">
                    {recentFeed.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#688975', padding: '12px 0', fontSize: 13 }}>
                        Chưa ghi nhận bao bì. Máy sẽ cập nhật tại đây sau khi cảm biến xác nhận.
                      </div>
                    ) : (
                      recentFeed.map((item, i) => (
                        <div key={i} className="kiosk-stream-item">
                          <span style={{ color: '#ffffff' }}>{item.accepted ? '✓' : '×'} {item.type}</span>
                          <strong style={{ color: item.accepted ? '#2fe07a' : '#fca5a5' }}>{item.accepted ? `+${item.points} điểm` : 'Không hợp lệ'}</strong>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="kiosk-infeed-buttons">
                    {catalogLoading ? <span>Đang tải loại bao bì…</span> : scanOptions.length ? scanOptions.map((option) => (
                      <div key={option.rule_id} className="kiosk-accepted-type">
                        <strong>{option.container_name}</strong>
                        <span>{option.material_name} · {option.volume_ml ? `${option.volume_ml} ml` : 'theo cấu hình máy'}</span>
                        <b>+{option.points_per_item} điểm</b>
                      </div>
                    )) : <p className="kiosk-scanner-error">{catalogError || 'Máy chưa có loại bao bì đang hoạt động trong cơ sở dữ liệu.'}</p>}
                  </div>
                </div>

                <p className="kiosk-hardware-note">Bao bì chỉ được tính sau khi cảm biến máy RVM xác nhận và đồng bộ dữ liệu.</p>

                {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}

                <p className="kiosk-hardware-note">Máy sẽ tự cập nhật số lượng, điểm và trạng thái sau khi cảm biến xác nhận.</p>
              </>
            )}

            {/* STEP 4: TÓM TẮT PHIÊN GỬI & BIÊN NHẬN */}
            {step === 4 && (
              <>
                <h1 className="kiosk-title">
                  Đang xác thực kết quả phiên gửi
                </h1>
                <p className="kiosk-copy">
                  Máy đang xác thực kết quả. Điểm sẽ được cộng sau khi bộ điều khiển hoàn tất phiên.
                </p>

                <div className="kiosk-receipt-box">
                  <div className="kiosk-receipt-head">
                    <div>
                      <h3>BIÊN NHẬN THU GOM RVM</h3>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                        Trạm: {machine?.machine_code ?? 'RVM'} · {machine?.location_name ?? 'Đang cập nhật'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12, background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: 9999, fontWeight: 700 }}>
                        Phiên #{sessionId}
                      </span>
                    </div>
                  </div>

                  <div className="kiosk-receipt-row">
                    <span>Phương thức nhận thưởng:</span>
                    <strong>{mode === 'member' ? 'Ví thành viên BravoForest' : 'Khách · không cộng điểm vào ví'}</strong>
                  </div>
                  <div className="kiosk-receipt-row">
                    <span>Tổng số lượng bao bì:</span>
                    <strong>{items} đơn vị</strong>
                  </div>
                  <div className="kiosk-receipt-total">
                    <span>ĐIỂM THEO QUY TẮC HIỆN HÀNH:</span>
                    <span>+{pointsEarned} ĐIỂM XANH</span>
                  </div>
                </div>

                {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}

                <p className="kiosk-hardware-note">Phiên sẽ tự chuyển sang hoàn tất khi máy chủ nhận xác nhận từ bộ điều khiển RVM.</p>
              </>
            )}

            {/* STEP 5: HOÀN TẤT & CẢM ƠN */}
            {step === 5 && (
              <>
                <div style={{ width: 90, height: 90, borderRadius: '50%', background: '#2fe07a', color: '#05140d', display: 'grid', placeItems: 'center', fontSize: 46, fontWeight: 900, margin: '0 auto 20px' }}>
                  ✓
                </div>

                <h1 className="kiosk-title">
                  Giao dịch thành công
                </h1>

                <p className="kiosk-copy">
                  {mode === 'member'
                    ? `Hệ thống đã cộng ${finalPoints ?? 0} điểm thưởng vào ví BravoForest của bạn.`
                    : `Phiên gửi đã được lưu. Khách không đăng nhập nên ${finalPoints ?? 0} điểm không được cộng vào ví.`}
                </p>

                <div style={{ background: 'rgba(47,224,122,0.12)', border: '1px solid rgba(47,224,122,0.3)', borderRadius: 20, padding: '20px 28px', maxWidth: 620, margin: '0 auto 36px', color: '#c4dcd0', fontSize: 16 }}>
                  {items} bao bì hợp lệ đã được lưu cho phiên thu gom #{sessionId}.
                </div>

                <div className="kiosk-actions">
                  <button
                    className="btn-kiosk-touch btn-kiosk-lime"
                    onClick={restart}
                    style={{ minWidth: 320 }}
                  >
                    Thực hiện giao dịch mới
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
              <span>{machine ? `Máy ${machine.machine_code} · Dữ liệu kết nối` : 'Đang kết nối máy RVM'}</span>
            {(step === 1 || step === 2) && <button className="kiosk-reset-link" onClick={restart}>Về màn hình chào</button>}
          </div>
        </footer>
      </div>
    </main>
  );
}
