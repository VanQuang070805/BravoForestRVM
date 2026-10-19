'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useRouter } from 'next/navigation';
import {
  Scan,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { apiPost } from '../lib/api';

interface CustomerQrScannerProps {
  isOpen: boolean;
  onClose: () => void;
  user?: { id?: string | number; [key: string]: unknown };
  onSuccess?: (sessionId: string) => void;
}

export function CustomerQrScanner({ isOpen, onClose, user, onSuccess }: CustomerQrScannerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scanning, setScanning] = useState(false);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');

  // Extract clean token or code from raw QR payload
  const parseQrPayload = (raw: string): string => {
    const trimmed = raw.trim();
    try {
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const obj = JSON.parse(trimmed);
        if (obj.qrToken) return String(obj.qrToken);
        if (obj.token) return String(obj.token);
      }
    } catch {
      // not JSON
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const url = new URL(trimmed);
        const t = url.searchParams.get('token') || url.searchParams.get('qrToken') || url.searchParams.get('code');
        if (t) return t;
      } catch {
        // invalid URL
      }
    }

    return trimmed;
  };

  // Perform claim with token
  const processToken = async (rawCode: string) => {
    const cleanToken = parseQrPayload(rawCode);
    if (!cleanToken) return;
    if (!/^[a-f0-9]{64}$/i.test(cleanToken)) {
      setClaimError('Mã QR không hợp lệ. Hãy quét lại mã đang hiển thị trên máy RVM.');
      return;
    }

    setDetectedToken(cleanToken);
    setProcessing(true);
    setClaimError('');
    setClaimSuccess(null);

    // Haptic feedback if available
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 40, 80]);
      } catch {
        // Ignore
      }
    }

    if (!user) {
      setClaimError('Đăng nhập tài khoản khách hàng trước khi quét mã tại máy.');
      setProcessing(false);
      return;
    }

    try {
      const response = await apiPost<{ sessionId?: string | number; session_id?: string | number; status?: string }>(
        '/sessions/claim',
        { qrToken: cleanToken }
      );
      const sid = String(response?.sessionId || response?.session_id || 'thành công');
      setClaimSuccess(sid);
      window.dispatchEvent(new Event('bravoforest:wallet-updated'));
      if (onSuccess) {
        onSuccess(sid);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể liên kết phiên nạp tại máy RVM.';
      setClaimError(message);
    } finally {
      setProcessing(false);
    }
  };

  // Handle camera stream
  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setScanning(false);
      return;
    }

    let active = true;
    let animFrame = 0;

    const startCamera = async () => {
      setCameraError('');
      setClaimError('');
      setClaimSuccess(null);
      setDetectedToken(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCamera(false);
        setCameraError('Trình duyệt chưa hỗ trợ quyền máy ảnh trực tiếp.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setScanning(true);

        const BarcodeDetectorClass = (window as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => {
            detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
          };
        }).BarcodeDetector;
        let detector: { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> } | null = null;
        try {
          if (BarcodeDetectorClass) detector = new BarcodeDetectorClass({ formats: ['qr_code'] });
        } catch {
          // Fall back to jsQR when the browser exposes an incomplete implementation.
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        let lastScanAt = 0;
        const scan = async () => {
          if (!active) return;
          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && performance.now() - lastScanAt >= 250) {
              lastScanAt = performance.now();
              let rawValue = '';
              if (detector) {
                rawValue = (await detector.detect(video))[0]?.rawValue ?? '';
              } else if (context && video.videoWidth && video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frame = context.getImageData(0, 0, canvas.width, canvas.height);
                rawValue = jsQR(frame.data, frame.width, frame.height)?.data ?? '';
              }
              if (rawValue) {
                active = false;
                void processToken(rawValue);
                return;
              }
            }
          } catch {
            // Ignore frame errors and keep scanning.
          }
          animFrame = requestAnimationFrame(scan);
        };
        animFrame = requestAnimationFrame(scan);
      } catch (err: unknown) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setCameraError('Ứng dụng chưa được cấp quyền truy cập Camera. Vui lòng cho phép quyền trên trình duyệt.');
        } else {
          setCameraError('Không thể khởi động camera trên thiết bị.');
        }
      }
    };

    void startCamera();

    return () => {
      active = false;
      cancelAnimationFrame(animFrame);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setScanning(false);
    };
  }, [isOpen, facingMode]);

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const retryScan = () => {
    setDetectedToken(null);
    setClaimError('');
    setClaimSuccess(null);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 19, 11, 0.68)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'qrFadeIn 0.25s ease-out'
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Quét mã QR Trạm RVM"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Centered White Popup Card */}
      <div
        style={{
          background: '#FFFFFF',
          color: '#112A1D',
          borderRadius: 24,
          width: '100%',
          maxWidth: 460,
          padding: '24px 24px 26px',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(17, 42, 29, 0.08)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}
      >
        {/* Header Bar - Fixed layout without squeezing */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'rgba(21, 128, 61, 0.1)',
                border: '1px solid rgba(21, 128, 61, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#15803d',
                flexShrink: 0
              }}
            >
              <Scan size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 800,
                  color: '#112A1D',
                  letterSpacing: '-0.02em',
                  whiteSpace: 'nowrap'
                }}
              >
                Quét mã QR
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 12.5,
                  color: '#456353',
                  whiteSpace: 'nowrap'
                }}
              >
                Đăng nhập &amp; nạp vỏ chai tại máy RVM
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!claimSuccess && !(detectedToken && !user) && (
              <button
                type="button"
                onClick={toggleFacingMode}
                title="Đổi camera trước/sau"
                aria-label="Đổi camera"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9999,
                  background: 'rgba(17, 42, 29, 0.05)',
                  border: '1px solid rgba(17, 42, 29, 0.1)',
                  color: '#112A1D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.2s ease'
                }}
              >
                <RefreshCw size={15} />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              title="Đóng máy quét"
              aria-label="Đóng máy quét"
              style={{
                width: 34,
                height: 34,
                borderRadius: 9999,
                background: 'rgba(17, 42, 29, 0.05)',
                border: '1px solid rgba(17, 42, 29, 0.1)',
                color: '#112A1D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.2s ease'
              }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Content Stages */}
        {claimSuccess ? (
          /* SUCCESS STATE */
          <div style={{ textAlign: 'center', width: '100%', padding: '12px 0 6px' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 9999,
                background: '#dcfce7',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid rgba(21, 128, 61, 0.2)'
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: '#112A1D' }}>
              Liên kết thành công!
            </h3>
            <p style={{ fontSize: 13, color: '#456353', margin: '0 0 20px', lineHeight: 1.55 }}>
              Phiên nạp chai <strong>#{claimSuccess}</strong> đã kích hoạt. Bạn có thể bỏ vỏ chai vào máy để nhận điểm ngay.
            </p>

            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push('/wallet');
                }}
                className="rvm-btn-primary"
                style={{ width: '100%', height: 44, fontSize: 13 }}
              >
                <span>Xem ví tích điểm</span>
                <ArrowRight size={15} />
              </button>

              <button
                type="button"
                onClick={retryScan}
                className="rvm-btn-secondary"
                style={{ width: '100%', height: 42, fontSize: 13 }}
              >
                <span>Quét mã khác</span>
              </button>
            </div>
          </div>
        ) : detectedToken && !user ? (
          /* DETECTED BUT NOT LOGGED IN */
          <div style={{ textAlign: 'center', width: '100%', padding: '12px 0 6px' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 9999,
                background: '#dbeafe',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                border: '1px solid rgba(37, 99, 235, 0.2)'
              }}
            >
              <ShieldCheck size={28} />
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: '#112A1D' }}>
              Đã nhận diện trạm RVM!
            </h3>
            <p style={{ fontSize: 13, color: '#456353', margin: '0 0 20px', lineHeight: 1.55 }}>
              Vui lòng đăng nhập tài khoản BravoForest để nhận điểm vào đúng ví của bạn.
            </p>

            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push('/login');
                }}
                className="rvm-btn-primary"
                style={{ width: '100%', height: 44, fontSize: 13 }}
              >
                <span>Đăng nhập để nhận điểm</span>
                <ArrowRight size={15} />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push('/register');
                }}
                className="rvm-btn-secondary"
                style={{ width: '100%', height: 42, fontSize: 13 }}
              >
                <span>Đăng ký tài khoản mới</span>
              </button>
            </div>
          </div>
        ) : (
          /* LIVE CAMERA VIEWFINDER - CENTERED BLACK VIEWPORT ON WHITE CARD */
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            {/* Centered Camera Viewport with Pure Black Background */}
            <div
              style={{
                position: 'relative',
                width: 250,
                height: 250,
                borderRadius: 20,
                overflow: 'hidden',
                background: '#000000',
                border: '3px solid #15803d',
                boxShadow: '0 10px 28px -4px rgba(21, 128, 61, 0.3)',
                margin: '12px auto'
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  background: '#000000'
                }}
              />

              {/* 4 Corner Targeting Reticles */}
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  width: 24,
                  height: 24,
                  borderTop: '3.5px solid #22c55e',
                  borderLeft: '3.5px solid #22c55e',
                  borderRadius: '5px 0 0 0',
                  pointerEvents: 'none'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 24,
                  height: 24,
                  borderTop: '3.5px solid #22c55e',
                  borderRight: '3.5px solid #22c55e',
                  borderRadius: '0 5px 0 0',
                  pointerEvents: 'none'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: 10,
                  width: 24,
                  height: 24,
                  borderBottom: '3.5px solid #22c55e',
                  borderLeft: '3.5px solid #22c55e',
                  borderRadius: '0 0 0 5px',
                  pointerEvents: 'none'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  width: 24,
                  height: 24,
                  borderBottom: '3.5px solid #22c55e',
                  borderRight: '3.5px solid #22c55e',
                  borderRadius: '0 0 5px 0',
                  pointerEvents: 'none'
                }}
              />

              {/* Laser Scanning Line Animation */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 3,
                  background: 'linear-gradient(90deg, transparent, #86efac, #22c55e, #86efac, transparent)',
                  boxShadow: '0 0 12px 2px rgba(34, 197, 94, 0.85)',
                  animation: 'qrLaserScan 2.2s ease-in-out infinite',
                  pointerEvents: 'none'
                }}
              />
            </div>

            {/* Instruction Guidance */}
            <p
              style={{
                fontSize: 13,
                fontWeight: 650,
                color: '#456353',
                margin: '10px 0 6px',
                textAlign: 'center',
                lineHeight: 1.45
              }}
            >
              Căn chỉnh mã QR trên màn hình trạm RVM vào giữa khung
            </p>

            {/* Status Messages */}
            {processing && (
              <div
                style={{
                  marginTop: 10,
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: 9999,
                  padding: '6px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Sparkles size={14} />
                <span>Đang kết nối trạm máy…</span>
              </div>
            )}

            {claimError && (
              <div
                style={{
                  marginTop: 10,
                  background: '#fef2f2',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  fontSize: 12,
                  color: '#dc2626',
                  textAlign: 'center',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                {claimError}
              </div>
            )}

            {cameraError && (
              <div
                style={{
                  marginTop: 10,
                  background: '#fefce8',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  fontSize: 12,
                  color: '#ca8a04',
                  textAlign: 'center',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              >
                {cameraError}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes qrLaserScan {
          0% {
            top: 5%;
            opacity: 0.3;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            top: 95%;
            opacity: 0.3;
          }
        }
        @keyframes qrFadeIn {
          from {
            opacity: 0;
            transform: scale(0.97);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
