'use client';

import { useState, useEffect, useRef } from 'react';
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
};

type KioskCustomer = {
  fullName: string;
  maskedEmail: string | null;
  walletStatus: string;
  walletBalance: number;
};

type RecentFeedItem = {
  id: string;
  type: string;
  points: number;
  accepted: boolean;
  aiClass: string | null;
  confidence: number | null;
  reason: string | null;
};

type RecentItemResponse = {
  item_id?: string | number;
  item_name?: string;
  points?: number | string;
  accepted?: boolean | number | string;
  ai_class?: string | null;
  ai_confidence?: number | string | null;
  reject_reason?: string | null;
};

function toRecentFeed(value: unknown): RecentFeedItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: RecentItemResponse, index) => {
    const confidence = item.ai_confidence == null ? null : Number(item.ai_confidence);
    return {
      id: item.item_id === undefined ? `recent-${index}` : String(item.item_id),
      type: item.item_name || 'Bao bì',
      points: Number(item.points || 0),
      accepted: item.accepted === true || Number(item.accepted) === 1,
      aiClass: item.ai_class || null,
      confidence: confidence !== null && Number.isFinite(confidence) ? confidence : null,
      reason: item.reject_reason || null,
    };
  });
}

function aiClassLabel(value: string) {
  if (value === 'clean_pet') return 'PET sạch';
  if (value === 'can') return 'Lon kim loại';
  return value.replace(/_/g, ' ').toUpperCase();
}

const steps = [
  { id: 0, title: 'Khởi động' },
  { id: 1, title: 'Tích điểm' },
  { id: 2, title: 'Liên kết' },
  { id: 3, title: 'Nạp bao bì' },
  { id: 4, title: 'Xác nhận' },
  { id: 5, title: 'Hoàn tất' }
];
const SESSION_STORAGE_KEY = 'bravoforest-rvm-session';
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const FINISH_WAIT_WARNING_MS = 20 * 1000;

export default function Kiosk() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'member' | 'guest'>('guest');
  const [items, setItems] = useState(0);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [finalPoints, setFinalPoints] = useState<number | null>(null);
  const [recentFeed, setRecentFeed] = useState<RecentFeedItem[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [sessionQr, setSessionQr] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState(0);
  const [qrSeconds, setQrSeconds] = useState(0);
  const [qrExpiredOnServer, setQrExpiredOnServer] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [linking, setLinking] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [returningToMethod, setReturningToMethod] = useState(false);
  const [returnToMethodAfterFinish, setReturnToMethodAfterFinish] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [cameraConnected, setCameraConnected] = useState(false);
  const [cameraImageLoaded, setCameraImageLoaded] = useState(false);
  const [cameraStreamFailed, setCameraStreamFailed] = useState(false);
  const [cameraRetry, setCameraRetry] = useState(0);
  const [scanOptions, setScanOptions] = useState<ScanOption[]>([]);
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [customer, setCustomer] = useState<KioskCustomer | null>(null);
  const [finishRequested, setFinishRequested] = useState(false);
  const [finishRequestedAt, setFinishRequestedAt] = useState(0);
  const [finishWaitExpired, setFinishWaitExpired] = useState(false);
  const [requestingFinish, setRequestingFinish] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [recoveringSession, setRecoveringSession] = useState(true);
  const [waitingForMachineIdle, setWaitingForMachineIdle] = useState(false);
  const createSessionInFlight = useRef(false);
  const refreshInFlight = useRef(false);
  const finishRequestPromise = useRef<Promise<boolean> | null>(null);
  const idleResetInFlight = useRef(false);
  const startupCleanupStarted = useRef(false);
  const pendingQrCleanup = useRef<{ sessionId: string; sessionToken: string } | null>(null);
  const idleFinishRequestedFor = useRef<string | null>(null);
  const logoutAfterInactivityRef = useRef<() => Promise<void>>(async () => {});
  const lastActivityAt = useRef(Date.now());
  const lastActivityReportAt = useRef(0);
  const latestDepositItemId = useRef<string | null>(null);
  const linkedCustomer = useRef(false);

  useEffect(() => {
    let stopped = false;
    const image = document.querySelector<HTMLImageElement>('.kiosk-camera-frame img');
    if (image?.naturalWidth) setCameraImageLoaded(true);
    const checkCamera = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8765/health', { cache: 'no-store' });
        const result = await response.json().catch(() => null) as { status?: string; frameAgeMs?: number | null } | null;
        const isReady = response.ok && result?.status === 'ready';
        if (!stopped) setCameraConnected(isReady);
      } catch {
        if (!stopped) setCameraConnected(false);
      }
    };
    void checkCamera();
    const cameraPoll = window.setInterval(() => void checkCamera(), 2500);
    const imagePoll = window.setInterval(() => {
      const currentImage = document.querySelector<HTMLImageElement>('.kiosk-camera-frame img');
      if (currentImage?.naturalWidth) setCameraImageLoaded(true);
    }, 250);
    return () => {
      stopped = true;
      window.clearInterval(cameraPoll);
      window.clearInterval(imagePoll);
    };
  }, []);

  useEffect(() => {
    if (!cameraStreamFailed) return;
    const retryTimer = window.setTimeout(() => {
      setCameraStreamFailed(false);
      setCameraImageLoaded(false);
      setCameraRetry((attempt) => attempt + 1);
    }, 5000);
    return () => window.clearTimeout(retryTimer);
  }, [cameraStreamFailed, cameraRetry]);

  useEffect(() => {
    if (!finishRequested || !finishRequestedAt) {
      setFinishWaitExpired(false);
      return;
    }
    const updateWaitState = () => setFinishWaitExpired(Date.now() - finishRequestedAt >= FINISH_WAIT_WARNING_MS);
    updateWaitState();
    const timer = window.setInterval(updateWaitState, 1000);
    return () => window.clearInterval(timer);
  }, [finishRequested, finishRequestedAt]);

  const noteServerActivity = (result: { linked?: boolean; recentItems?: Array<{ item_id?: string | number }> }) => {
    const isLinked = result.linked === true;
    if (isLinked && !linkedCustomer.current) lastActivityAt.current = Date.now();
    linkedCustomer.current = isLinked;
    const latestItemId = result.recentItems?.[0]?.item_id;
    const itemId = latestItemId === undefined ? null : String(latestItemId);
    if (itemId !== latestDepositItemId.current) {
      lastActivityAt.current = Date.now();
      latestDepositItemId.current = itemId;
    }
  };

  const syncContinuationDeadline = (secondsRemaining: unknown) => {
    const reportedSeconds = Number(secondsRemaining);
    const remaining = Number.isFinite(reportedSeconds)
      ? Math.min(IDLE_TIMEOUT_MS / 1000, Math.max(0, reportedSeconds))
      : 0;
    lastActivityAt.current = Date.now() - (IDLE_TIMEOUT_MS - remaining * 1000);
  };

  useEffect(() => {
    const markActivity = () => {
      const now = Date.now();
      lastActivityAt.current = now;
      if (!sessionId || !sessionToken || ![3, 5].includes(step) || now - lastActivityReportAt.current < 10_000) return;
      lastActivityReportAt.current = now;
      void fetch('/kiosk/machine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'activity', sessionId, statusToken: sessionToken }),
        cache: 'no-store',
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('pointerdown', markActivity, true);
    window.addEventListener('keydown', markActivity, true);
    return () => {
      window.removeEventListener('pointerdown', markActivity, true);
      window.removeEventListener('keydown', markActivity, true);
    };
  }, [sessionId, sessionToken, step]);

  useEffect(() => {
    if (startupCleanupStarted.current) return;
    startupCleanupStarted.current = true;

    const endPreviousKioskSession = async () => {
      try {
        const saved = localStorage.getItem(SESSION_STORAGE_KEY) ?? sessionStorage.getItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        if (saved) {
          const session = JSON.parse(saved) as { sessionId?: string; sessionToken?: string; step?: number };
          const id = session.sessionId ?? '';
          const token = session.sessionToken ?? '';
          const savedStep = Number(session.step);
          if (/^\d{1,20}$/.test(id) && /^[a-f0-9]{64}$/i.test(token)) {
            if (savedStep === 2) {
              pendingQrCleanup.current = { sessionId: id, sessionToken: token };
              setWaitingForMachineIdle(true);
              const response = await fetch('/kiosk/machine', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'cancel', sessionId: id, statusToken: token }),
                cache: 'no-store',
              });
              if (response.ok) {
                pendingQrCleanup.current = null;
                setWaitingForMachineIdle(false);
              }
            } else {
              if ([3, 4].includes(savedStep)) setWaitingForMachineIdle(true);
              if (savedStep === 3) {
                await fetch('/kiosk/machine', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: 'finish', sessionId: id }),
                  cache: 'no-store',
                });
              }
              await fetch('/kiosk/machine', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'logout', sessionId: id, statusToken: token }),
                cache: 'no-store',
              });
            }
          }
        }
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        setSessionRestored(true);
      }
    };

    void endPreviousKioskSession();
  }, []);

  useEffect(() => {
    if (!sessionRestored) return;
    if (!sessionId || !sessionToken || step < 2) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      sessionId, sessionToken, sessionQr, qrExpiresAt, mode, step,
    }));
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }, [sessionRestored, sessionId, sessionToken, sessionQr, qrExpiresAt, mode, step, items, pointsEarned, finalPoints]);

  useEffect(() => {
    if (!sessionRestored) return;
    if (sessionId) {
      setRecoveringSession(false);
      return;
    }
    if (waitingForMachineIdle) {
      let stopped = false;
      let checking = false;
      let timer = 0;
      const waitForMachine = async () => {
        if (stopped || checking) return;
        checking = true;
        try {
          const pendingQr = pendingQrCleanup.current;
          if (pendingQr) {
            const statusResponse = await fetch('/kiosk/machine', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'status', sessionId: pendingQr.sessionId, statusToken: pendingQr.sessionToken }),
              cache: 'no-store',
            });
            if (statusResponse.status === 404) {
              pendingQrCleanup.current = null;
            } else {
              if (!statusResponse.ok) return;
              const status = await statusResponse.json();
              if (status.status === 'WAITING_LOGIN' && !status.expired) {
                const cancelResponse = await fetch('/kiosk/machine', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: 'cancel', sessionId: pendingQr.sessionId, statusToken: pendingQr.sessionToken }),
                  cache: 'no-store',
                });
                if (!cancelResponse.ok) return;
              } else if (['DEPOSITING', 'PROCESSING', 'COMPLETED'].includes(status.status)) {
                await fetch('/kiosk/machine', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: 'finish', sessionId: pendingQr.sessionId }),
                  cache: 'no-store',
                });
                await fetch('/kiosk/machine', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action: 'logout', sessionId: pendingQr.sessionId, statusToken: pendingQr.sessionToken }),
                  cache: 'no-store',
                });
                pendingQrCleanup.current = null;
                if (['DEPOSITING', 'PROCESSING'].includes(status.status)) return;
              }
            }
            pendingQrCleanup.current = null;
            setWaitingForMachineIdle(false);
            setRecoveringSession(false);
            if (timer) window.clearInterval(timer);
            return;
          }

          const response = await fetch('/kiosk/machine', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'active-status' }),
            cache: 'no-store',
          });
          const result = await response.json();
          if (!response.ok) return;
          if (result.status === 'DEPOSITING' && result.sessionId) {
            const activeSessionId = String(result.sessionId);
            if (idleFinishRequestedFor.current !== activeSessionId) {
              const finish = await fetch('/kiosk/machine', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'finish', sessionId: activeSessionId }),
                cache: 'no-store',
              });
              if (!finish.ok) return;
              idleFinishRequestedFor.current = activeSessionId;
            }
          } else if (!result.sessionId || result.status === 'IDLE') {
            setWaitingForMachineIdle(false);
            setRecoveringSession(false);
            idleFinishRequestedFor.current = null;
            if (timer) window.clearInterval(timer);
          }
        } catch {
          // Keep the start screen locked until the machine can confirm it is idle.
        } finally {
          checking = false;
        }
      };
      void waitForMachine();
      timer = window.setInterval(() => void waitForMachine(), 1800);
      return () => {
        stopped = true;
        window.clearInterval(timer);
      };
    }
    let stopped = false;
    const recoverActiveSession = async () => {
      let activeSessionFound = false;
      try {
        const response = await fetch('/kiosk/machine', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'active-status' }),
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Không thể khôi phục phiên máy.');
        if (stopped || !result.sessionId || !['DEPOSITING', 'PROCESSING'].includes(result.status)) return;
        activeSessionFound = true;
        setWaitingForMachineIdle(true);
      } catch {
        // The start screen remains available if the machine API is temporarily offline.
      } finally {
        if (!stopped && !activeSessionFound) setRecoveringSession(false);
      }
    };
    void recoverActiveSession();
    return () => { stopped = true; };
  }, [sessionRestored, sessionId, waitingForMachineIdle]);

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
    if (createSessionInFlight.current) return;
    createSessionInFlight.current = true;
    setScannerError('');
    setLinking(true);
    try {
      const response = await fetch('/kiosk/machine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', mode: requestedMode })
      });
      const result = await response.json();
      if (!response.ok) {
        const message = String(result.message || 'Không thể mở phiên tại máy.');
        if (response.status === 409 && /machine already has an active session/i.test(message)) {
          throw new Error('Máy đang có phiên gửi hoạt động. Hãy tiếp tục phiên hiện tại trước khi tạo phiên mới.');
        }
        throw new Error(message);
      }
      if (!/^\d{1,20}$/.test(String(result.sessionId ?? ''))) {
        throw new Error('Máy không nhận được mã đăng nhập hợp lệ từ API.');
      }
      if (!/^[a-f0-9]{64}$/i.test(String(result.statusToken ?? ''))) {
        throw new Error('Máy không nhận được mã phiên an toàn từ API.');
      }
      setSessionId(String(result.sessionId));
      setSessionToken(String(result.statusToken));
      lastActivityAt.current = Date.now();
      latestDepositItemId.current = null;
      linkedCustomer.current = false;
      idleFinishRequestedFor.current = null;
      setQrExpiredOnServer(false);
      setItems(0);
      setPointsEarned(0);
      setFinalPoints(null);
      setRecentFeed([]);
      setCustomer(null);
      setFinishRequested(false);
      setFinishRequestedAt(0);
      setFinishWaitExpired(false);
      setReturnToMethodAfterFinish(false);
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
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        sessionId: String(result.sessionId), sessionToken: String(result.statusToken),
        qrExpiresAt: Date.now() + expiresIn * 1000, mode: 'member', step: 2,
      }));
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
      createSessionInFlight.current = false;
      setLinking(false);
    }
  };

  const startAnotherDeposit = async () => {
    if (mode === 'guest') {
      await createSession('GUEST');
      return;
    }
    if (createSessionInFlight.current) return;
    if (!sessionId || !sessionToken) {
      setScannerError('Phiên đăng nhập tại máy đã hết hiệu lực. Hãy quay lại và quét QR để đăng nhập lại.');
      return;
    }

    createSessionInFlight.current = true;
    setLinking(true);
    setScannerError('');
    try {
      const response = await fetch('/kiosk/machine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'continue', sessionId, statusToken: sessionToken }),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Máy đang có phiên gửi khác. Hãy hoàn tất phiên đó rồi thử lại.');
        }
        if (response.status === 401 || response.status === 404) {
          throw new Error('Phiên đăng nhập đã hết hiệu lực. Hãy quét QR để đăng nhập lại.');
        }
        throw new Error('Không thể mở lượt gửi mới. Hãy làm mới trạng thái máy rồi thử lại.');
      }
      if (!/^\d{1,20}$/.test(String(result.sessionId ?? '')) || !/^[a-f0-9]{64}$/i.test(String(result.statusToken ?? ''))) {
        throw new Error('Máy không trả về phiên đăng nhập hợp lệ. Hãy làm mới rồi thử lại.');
      }

      setSessionId(String(result.sessionId));
      setSessionToken(String(result.statusToken));
      setSessionQr('');
      setQrExpiresAt(0);
      setQrSeconds(0);
      setQrExpiredOnServer(false);
      setItems(0);
      setPointsEarned(0);
      setFinalPoints(null);
      setRecentFeed([]);
      setCustomer(result.customer && typeof result.customer === 'object' ? result.customer as KioskCustomer : customer);
      setFinishRequested(false);
      setFinishRequestedAt(0);
      setFinishWaitExpired(false);
      setReturnToMethodAfterFinish(false);
      setMode('member');
      lastActivityAt.current = Date.now();
      latestDepositItemId.current = null;
      linkedCustomer.current = true;
      idleFinishRequestedFor.current = null;
      setStep(3);
    } catch (error) {
      setScannerError(error instanceof Error ? error.message : 'Không thể mở lượt gửi mới.');
    } finally {
      createSessionInFlight.current = false;
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
          body: JSON.stringify(sessionToken
            ? { action: 'status', sessionId, statusToken: sessionToken }
            : { action: 'active-status', sessionId }),
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Không thể kiểm tra trạng thái đăng nhập.');
        if (stopped) return;
        setItems(Number(result.acceptedItems ?? 0));
        setPointsEarned(Number(result.points ?? 0));
        noteServerActivity(result);
        setCustomer(result.customer && typeof result.customer === 'object' ? result.customer as KioskCustomer : null);
        const machineStillFinishing = Boolean(result.finishRequested) && ['DEPOSITING', 'PROCESSING'].includes(result.status);
        setFinishRequested(machineStillFinishing);
        setFinishRequestedAt(machineStillFinishing ? (current) => current || Date.now() : 0);
        setRecentFeed(toRecentFeed(result.recentItems));
        const linked = result.linked === true;
        const serverExpired = result.expired === true || result.status === 'EXPIRED';
        setQrExpiredOnServer(serverExpired);
        if (step === 2 && linked && ['DEPOSITING', 'PROCESSING'].includes(result.status)) {
          setScannerError('');
          setStep(result.status === 'PROCESSING' ? 4 : 3);
        } else if (step === 2 && serverExpired) {
          setScannerError('Mã QR đã hết hạn. Hãy tạo mã mới để tiếp tục.');
        } else if (step === 2 && result.status === 'WAITING_LOGIN') {
          setScannerError('');
        } else if (result.status === 'PROCESSING' && step < 4) {
          setFinishRequested(true);
          setStep(4);
        } else if (result.status === 'COMPLETED' && step < 5) {
          if (returnToMethodAfterFinish) {
            returnToMethodSelection();
          } else {
            setFinalPoints(Number(result.points ?? 0));
            setFinishRequested(true);
            syncContinuationDeadline(result.continuationSecondsRemaining);
            setStep(5);
          }
        } else if (result.status === 'CANCELLED' || result.status === 'EXPIRED') {
          setScannerError('Phiên gửi đã đóng. Hãy bắt đầu phiên mới.');
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
  }, [step, sessionId, sessionToken, returnToMethodAfterFinish]);

  const requestFinish = async () => {
    if (!sessionId) {
      setScannerError('Không xác định được phiên gửi. Hãy làm mới trạng thái máy trước khi quay lại.');
      return false;
    }
    if (finishRequestPromise.current) return finishRequestPromise.current;

    const pendingFinish = (async () => {
      setRequestingFinish(true);
      setScannerError('');
      try {
        const response = await fetch('/kiosk/machine', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'finish', sessionId }),
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Không thể kết thúc phiên gửi.');
        if (result.finishRequested !== true) throw new Error('Chưa ghi nhận yêu cầu kết thúc. Hãy thử lại.');
        const machineStillFinishing = ['DEPOSITING', 'PROCESSING'].includes(result.status);
        setFinishRequested(machineStillFinishing);
        setFinishRequestedAt(machineStillFinishing ? Date.now() : 0);
        return true;
      } catch (error) {
        setScannerError(error instanceof Error ? error.message : 'Không thể kết thúc phiên gửi.');
        return false;
      } finally {
        setRequestingFinish(false);
        finishRequestPromise.current = null;
      }
    })();
    finishRequestPromise.current = pendingFinish;
    return pendingFinish;
  };

  useEffect(() => {
    if (step !== 2 || !qrExpiresAt) return;
    const updateCountdown = () => setQrSeconds(Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000)));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [step, qrExpiresAt]);

  const cancelPendingQrSession = async () => {
    if (step !== 2 || !sessionId || !sessionToken) return true;
    try {
      const response = await fetch('/kiosk/machine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', sessionId, statusToken: sessionToken }),
        cache: 'no-store',
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionId('');
    setSessionToken('');
    setSessionQr('');
    setQrExpiresAt(0);
    setQrSeconds(0);
    setQrExpiredOnServer(false);
    setItems(0);
    setPointsEarned(0);
    setFinalPoints(null);
    setRecentFeed([]);
    setCustomer(null);
    setFinishRequested(false);
    setFinishRequestedAt(0);
    setFinishWaitExpired(false);
    setReturnToMethodAfterFinish(false);
    setScannerError('');
  };

  function returnToMethodSelection() {
    revokeKioskSession();
    clearSession();
    setMode('guest');
    setStep(1);
  }

  const revokeKioskSession = (id = sessionId, token = sessionToken) => {
    if (!id || !token) return;
    void fetch('/kiosk/machine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'logout', sessionId: id, statusToken: token }),
      cache: 'no-store',
    }).catch(() => undefined);
  };

  const changeMethod = async () => {
    setReturningToMethod(true);
    setScannerError('');
    try {
      const cancelled = await cancelPendingQrSession();
      if (!cancelled) {
        const current = await refreshKiosk();
        if (current?.status === 'CANCELLED' || current?.status === 'EXPIRED' || current?.expired === true) {
          clearSession();
          setStep(1);
        } else if (current?.status === 'WAITING_LOGIN') {
          setScannerError('Mã QR vẫn đang mở. Hãy tiếp tục quét hoặc thử quay lại lần nữa.');
        } else if (!current) {
          setScannerError('Chưa kết nối được với máy để hủy mã QR. Hãy kiểm tra kết nối rồi thử quay lại.');
        }
        return;
      }
      clearSession();
      setStep(1);
    } finally {
      setReturningToMethod(false);
    }
  };

  const finishAndReturnToMethod = async () => {
    if (returningToMethod || returnToMethodAfterFinish) return;
    setReturnToMethodAfterFinish(true);
    setReturningToMethod(true);
    const accepted = await requestFinish();
    setReturningToMethod(false);
    if (!accepted) setReturnToMethodAfterFinish(false);
  };

  const goBack = () => {
    if (step === 1) setStep(0);
    else if (step === 2) void changeMethod();
    else if (step === 3) void finishAndReturnToMethod();
    else if (step === 4) setReturnToMethodAfterFinish(true);
    else if (step === 5) returnToMethodSelection();
  };

  async function refreshKiosk() {
    if (refreshInFlight.current) return null;
    refreshInFlight.current = true;
    setRefreshingStatus(true);
    setScannerError('');
    try {
      if (step <= 1) {
        const catalogResponse = await fetch('/kiosk/machine?catalog=1', { cache: 'no-store' });
        const catalog = await catalogResponse.json();
        if (!catalogResponse.ok) throw new Error(catalog.message || 'Không thể tải lại cấu hình máy.');
        setMachine(catalog.machine ?? null);
        setScanOptions(Array.isArray(catalog.items) ? catalog.items : []);
        setCatalogError('');
        setCatalogLoading(false);
      }

      const body = sessionId
        ? sessionToken
          ? { action: 'status', sessionId, statusToken: sessionToken }
          : { action: 'active-status', sessionId }
        : { action: 'active-status' };
      const response = await fetch('/kiosk/machine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Không thể làm mới trạng thái máy.');

      if (waitingForMachineIdle) {
        if (!result.sessionId || result.status === 'IDLE') {
          setWaitingForMachineIdle(false);
          setRecoveringSession(false);
        }
        return result;
      }

      if (!sessionId && result.sessionId && ['DEPOSITING', 'PROCESSING'].includes(result.status)) {
        setSessionId(String(result.sessionId));
        setSessionToken('');
        setSessionQr('');
        setQrExpiresAt(0);
        setMode(result.linked ? 'member' : 'guest');
      }
      setItems(Number(result.acceptedItems ?? 0));
      setPointsEarned(Number(result.points ?? 0));
      noteServerActivity(result);
      setCustomer(result.customer && typeof result.customer === 'object' ? result.customer as KioskCustomer : null);
      const machineStillFinishing = Boolean(result.finishRequested) && ['DEPOSITING', 'PROCESSING'].includes(result.status);
      setFinishRequested(machineStillFinishing);
      setFinishRequestedAt(machineStillFinishing ? (current) => current || Date.now() : 0);
      setRecentFeed(toRecentFeed(result.recentItems));

      const serverExpired = result.expired === true || result.status === 'EXPIRED';
      setQrExpiredOnServer(serverExpired);
      if (result.status === 'COMPLETED') {
        if (returnToMethodAfterFinish) {
          returnToMethodSelection();
        } else {
          setFinalPoints(Number(result.points ?? 0));
          syncContinuationDeadline(result.continuationSecondsRemaining);
          setStep(5);
        }
      } else if (result.status === 'PROCESSING') {
        setStep(4);
      } else if (result.status === 'DEPOSITING') {
        setStep(3);
      } else if (serverExpired) {
        setScannerError('Mã QR đã hết hạn. Hãy tạo mã mới để tiếp tục.');
      } else if (result.status === 'CANCELLED') {
        setScannerError('Phiên gửi đã đóng. Hãy quay lại để bắt đầu phiên mới.');
      }
      return result;
    } catch (error) {
      setScannerError(error instanceof Error ? error.message : 'Không thể làm mới trạng thái máy.');
      return null;
    } finally {
      refreshInFlight.current = false;
      setRefreshingStatus(false);
    }
  }

  const logoutAfterInactivity = async () => {
    if (idleResetInFlight.current || step === 0) return;
    idleResetInFlight.current = true;
    let waitForMachine = false;
    let shouldReset = true;
    try {
      if (sessionId && [2, 3, 4].includes(step)) {
        const current = await refreshKiosk();
        if (Date.now() - lastActivityAt.current < IDLE_TIMEOUT_MS) {
          shouldReset = false;
          return;
        }

        if (current?.status === 'DEPOSITING') {
          waitForMachine = true;
          await requestFinish();
        } else if (current?.status === 'PROCESSING') {
          waitForMachine = true;
        } else if (current?.status === 'WAITING_LOGIN') {
          const cancelled = await cancelPendingQrSession();
          waitForMachine = !cancelled;
        } else if (!current && (step === 3 || step === 4)) {
          waitForMachine = true;
          if (step === 3) await requestFinish();
        } else if (!current && step === 2) {
          waitForMachine = !(await cancelPendingQrSession());
        }
      }
      if (Date.now() - lastActivityAt.current < IDLE_TIMEOUT_MS) shouldReset = false;
    } finally {
      if (shouldReset) {
        if ([3, 4, 5].includes(step)) revokeKioskSession();
        if (waitForMachine) {
          idleFinishRequestedFor.current = null;
          setWaitingForMachineIdle(true);
          setRecoveringSession(true);
        }
        setMode('guest');
        setStep(0);
        clearSession();
        lastActivityAt.current = Date.now();
        latestDepositItemId.current = null;
        linkedCustomer.current = false;
      }
      idleResetInFlight.current = false;
    }
  };
  logoutAfterInactivityRef.current = logoutAfterInactivity;

  useEffect(() => {
    if (step === 0) return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityAt.current >= IDLE_TIMEOUT_MS) {
        void logoutAfterInactivityRef.current();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  const progressIndex = Math.min(step, 5);
  const recentActivityRows = recentFeed.map((item) => (
    <div key={item.id} className={'activity-row ' + (item.accepted ? 'accepted' : 'rejected')}>
      <span className="activity-indicator" aria-hidden="true">
        <svg viewBox="0 0 16 16"><path d={item.accepted ? 'm3 8 3 3 7-7' : 'm4 4 8 8m0-8-8 8'} /></svg>
      </span>
      <span className="activity-description">
        <span className="activity-type">{item.type}</span>
        <small className="activity-meta">
          {item.aiClass ? `AI: ${aiClassLabel(item.aiClass)}` : 'AI chưa nhận diện được'}
          {item.confidence !== null ? ` · ${Math.round(item.confidence * 100)}%` : ''}
          {!item.accepted && item.reason ? ` · ${item.reason}` : ''}
        </small>
      </span>
      <span className="activity-result">
        <strong>{item.accepted ? 'Hợp lệ' : 'Không hợp lệ'}</strong>
        {item.accepted && <small>+{item.points} điểm</small>}
      </span>
    </div>
  ));

  return (
    <main className="kiosk-shell">
      <div className="kiosk-screen">
        <nav className={'kiosk-progress-bar' + ([1, 2, 3, 4].includes(step) ? ' has-back-action' : step === 5 ? ' has-single-back-action' : '')} aria-label="Tiến trình gửi bao bì">
          {steps.map((stage, index) => (
            <div
              key={stage.id}
              className={'kiosk-progress-step ' + (index === progressIndex ? 'active' : index < progressIndex ? 'done' : '')}
              aria-current={index === progressIndex ? 'step' : undefined}
            >
              <span className="kiosk-progress-num">{index + 1}</span>
              <span className="kiosk-progress-label">{stage.title}</span>
            </div>
          ))}
          {step > 0 && (
            <div className="kiosk-quick-actions" aria-label="Điều khiển kiosk">
                <button
                  type="button"
                  className="kiosk-quick-action"
                  onClick={goBack}
                  disabled={linking || (step === 2 && returningToMethod) || ([3, 4].includes(step) && (returningToMethod || returnToMethodAfterFinish))}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.8 4.5 7.2 10l5.6 5.5M7.5 10h9" /></svg>
                  <span>
                    {step === 3 && (returningToMethod ? 'Đang kết thúc lượt…' : returnToMethodAfterFinish ? 'Đang chờ chốt lượt…' : 'Kết thúc & quay lại')}
                    {step === 4 && (returnToMethodAfterFinish ? 'Đang chờ chốt lượt…' : 'Về lựa chọn')}
                    {step === 5 && 'Quay lại chọn cách dùng'}
                    {step < 3 && (returningToMethod ? 'Đang quay lại…' : 'Quay lại')}
                  </span>
                </button>
              {step === 1 && (
                <button type="button" className="kiosk-quick-action" onClick={() => void refreshKiosk()} disabled={refreshingStatus || recoveringSession || returningToMethod || linking}>
                  <svg className={refreshingStatus ? 'is-spinning' : ''} viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 8A6.5 6.5 0 0 0 4.8 5.2L3.5 6.5M3.5 6.5V3.7m0 2.8h2.8M3.8 12A6.5 6.5 0 0 0 15.2 14.8l1.3-1.3m0 0v2.8m0-2.8h-2.8" /></svg>
                  <span>{refreshingStatus ? 'Đang tải…' : 'Tải lại cấu hình'}</span>
                </button>
              )}
            </div>
          )}
        </nav>

        <section className={'kiosk-main stage-' + step}>
          <div className="kiosk-content" key={step}>
            {step === 0 && (
              <div className="welcome-layout">
                <div className="welcome-copy">
                  <h1 className="kiosk-title">Gửi chai,<br />nhận điểm.</h1>
                  <p className="kiosk-copy">
                    Đưa bao bì được máy hỗ trợ vào khay. Thành viên nhận điểm trong ví BravoForest.
                  </p>

                  <div className="materials-overview">
                    <h2>Máy đang nhận</h2>
                    {catalogLoading ? (
                      <p className="materials-state">Đang tải danh sách bao bì…</p>
                    ) : scanOptions.length ? (
                      <div className="materials-list">
                        {Array.from(new Map(scanOptions.map((option) => [option.material_code, option])).values()).map((option) => (
                          <div className="material-row" key={option.material_code}>
                            <span className="material-marker" aria-hidden="true" />
                            <div>
                              <strong>{option.material_name}</strong>
                              <span>{scanOptions.filter((item) => item.material_code === option.material_code).map((item) => item.container_name).join(' · ')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : catalogError ? null : (
                      <p className="materials-state">Máy chưa có loại bao bì đang hoạt động.</p>
                    )}
                  </div>

                  {catalogError && <p className="kiosk-scanner-error" role="alert">{catalogError}</p>}

                  <button className="btn-kiosk-touch btn-kiosk-lime welcome-action" onClick={() => setStep(1)} disabled={recoveringSession || waitingForMachineIdle}>
                    {waitingForMachineIdle ? 'Đang kết thúc lượt trước…' : recoveringSession ? 'Đang kiểm tra phiên máy…' : 'Bắt đầu gửi bao bì'}
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
                  </button>
                </div>

                <div className="welcome-art" aria-hidden="true">
                  <div className="welcome-art-caption">
                    <span>THU GOM</span>
                    <strong>Tái chế bắt đầu từ đây</strong>
                  </div>
                  <svg className="welcome-art-illustration" viewBox="0 0 360 310" role="presentation">
                    <circle className="art-orbit" cx="180" cy="155" r="122" />
                    <path className="art-loop" d="M106 84c23-30 62-43 97-34l-8-17 49 13-32 39-2-19c-32-10-67 2-87 29" />
                    <path className="art-loop art-loop-secondary" d="M256 177c-5 38-32 69-68 78l17 10-46 19 7-50 12 15c31-10 52-37 54-70" />
                    <path className="art-bottle" d="M154 101h52v19c0 7 5 12 12 18l10 10v99c0 11-8 19-19 19h-58c-11 0-19-8-19-19v-99l10-10c7-6 12-11 12-18v-19Z" />
                    <path className="art-bottle-detail" d="M154 120h52M143 158h85M151 204h70" />
                    <path className="art-leaf" d="M179 180c13-22 31-22 39-21-3 22-14 37-39 37m0 0c-8-14-21-19-31-18 3 15 13 23 31 23m0-5v31" />
                    <circle className="art-spark" cx="76" cy="183" r="5" />
                    <circle className="art-spark" cx="279" cy="105" r="4" />
                    <circle className="art-spark" cx="265" cy="243" r="6" />
                  </svg>
                  <span className="art-footnote">BRAVOFOREST · RVM</span>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="method-screen">
                <div className="screen-heading">
                  <h1 className="kiosk-title">Bạn muốn nhận điểm thế nào?</h1>
                  <p className="kiosk-copy">Chọn cách gửi phù hợp với bạn.</p>
                </div>

                <div className="kiosk-choice-grid">
                  <button
                    type="button"
                    className="kiosk-choice-card member-choice"
                    onClick={() => void createSession('MEMBER')}
                    disabled={linking}
                  >
                    <span className="choice-icon" aria-hidden="true">
                      <svg viewBox="0 0 32 32"><rect x="7" y="4" width="18" height="24" rx="3" /><path d="M12 9h2v2h-2zM18 9h2v2h-2zM12 15h2v2h-2zM18 15h2v2h-2zM12 21h2v2h-2zM18 21h2v2h-2z" /></svg>
                    </span>
                    <span className="choice-content">
                      <strong>Tài khoản thành viên</strong>
                      <span>Quét QR bằng điện thoại đã đăng nhập. Điểm được cộng vào ví của bạn.</span>
                    </span>
                    <span className="choice-action">{linking ? 'Đang mở phiên…' : 'Hiện mã QR'}
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="kiosk-choice-card guest-choice"
                    onClick={() => void createSession('GUEST')}
                    disabled={linking}
                  >
                    <span className="choice-icon" aria-hidden="true">
                      <svg viewBox="0 0 32 32"><path d="M6 11h20l-2 16H8L6 11Z" /><path d="M11 11a5 5 0 0 1 10 0M12 17c2 3 6 3 8 0" /></svg>
                    </span>
                    <span className="choice-content">
                      <strong>Gửi không đăng nhập</strong>
                      <span>Giao dịch vẫn được lưu. Điểm của phiên khách không cộng vào ví.</span>
                    </span>
                    <span className="choice-action">{linking ? 'Đang mở phiên…' : 'Tiếp tục với khách'}
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
                    </span>
                  </button>
                </div>

                {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}
              </div>
            )}

            {step === 2 && mode === 'member' && (
              <div className="qr-layout">
                <div className="qr-instructions">
                  <h1 className="kiosk-title">Quét QR để kết nối ví</h1>
                  <p className="kiosk-copy">Dùng điện thoại đã đăng nhập BravoForest để liên kết tài khoản với phiên gửi này.</p>
                  <ol className="qr-steps">
                    <li><span>1</span>Mở ứng dụng BravoForest</li>
                    <li><span>2</span>Chọn “Quét QR tại máy”</li>
                    <li><span>3</span>Đưa camera vào mã bên cạnh</li>
                  </ol>
                  <p className="qr-expiry" aria-live="polite">
                    {qrExpiredOnServer
                      ? 'Mã QR đã hết hạn. Hãy tạo mã mới để tiếp tục.'
                      : qrSeconds > 0
                        ? 'Mã còn hiệu lực ' + qrSeconds + ' giây'
                        : 'Đang xác nhận thời hạn mã với máy…'}
                  </p>
                </div>

                <div className="qr-panel">
                  <div className="qr-frame">
                    {sessionQr ? (
                      <img src={sessionQr} width="232" height="232" alt="Mã QR đăng nhập máy RVM" />
                    ) : (
                      <span className="qr-loading">Đang tạo mã QR…</span>
                    )}
                  </div>
                  <p className="qr-scan-hint">Mã chỉ dùng cho phiên này</p>
                  {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}
                  <div className="qr-actions">
                    <button
                      className="btn-kiosk-touch btn-kiosk-lime"
                      onClick={() => void createSession('MEMBER')}
                      disabled={linking || returningToMethod || !qrExpiredOnServer}
                    >
                      {linking ? 'Đang tạo mã…' : qrExpiredOnServer ? 'Tạo mã QR mới' : qrSeconds > 0 ? 'Mã còn hiệu lực' : 'Đang kiểm tra mã…'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="infeed-layout">
                <section className="infeed-primary">
                  <div className="session-status"><span className="kiosk-status-dot" />
                    {returnToMethodAfterFinish ? 'Đang hoàn tất để quay lại chọn cách dùng' : finishRequested ? 'Đã gửi yêu cầu · máy đang chốt lượt' : 'Phiên gửi đang hoạt động'}
                  </div>
                  <h1 className="kiosk-title">Đưa bao bì vào khay nhận</h1>

                  {mode === 'member' && customer && (
                    <div className="kiosk-customer-card" aria-label="Tài khoản đã liên kết">
                      <span className="customer-card-mark" aria-hidden="true">BF</span>
                      <div>
                        <strong>{customer.fullName}</strong>
                        <span>{customer.maskedEmail ?? 'Tài khoản BravoForest'}</span>
                      </div>
                      <b>{customer.walletBalance.toLocaleString('vi-VN')} điểm</b>
                    </div>
                  )}

                  <div className="infeed-metrics">
                    <div className="infeed-metric">
                      <span>Đã nhận</span>
                      <strong>{items}</strong>
                      <small>bao bì hợp lệ</small>
                    </div>
                    <div className="infeed-metric points-metric">
                      <span>Điểm dự kiến</span>
                      <strong>+{pointsEarned}</strong>
                      <small>được máy chủ chốt</small>
                    </div>
                  </div>

                  <div className="accepted-types">
                    <h2>Loại máy nhận</h2>
                    {catalogLoading ? (
                      <p className="materials-state">Đang tải cấu hình…</p>
                    ) : scanOptions.length ? (
                      <div className="accepted-type-list">
                        {scanOptions.map((option) => (
                          <div key={option.rule_id} className="accepted-type-row">
                            <strong>{option.container_name}</strong>
                            <span>{option.material_name} · {option.volume_ml ? option.volume_ml + ' ml' : 'theo cấu hình máy'}</span>
                            <b>+{option.points_per_item} điểm</b>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="materials-state">{catalogError || 'Máy chưa có loại bao bì đang hoạt động.'}</p>
                    )}
                  </div>
                </section>

                <section className="infeed-activity" aria-label="Bao bì vừa nhận">
                  <div className="activity-heading">
                    <h2>Hoạt động gần đây</h2>
                    <span>{items} đã nhận</span>
                  </div>
                  {recentFeed.length === 0 ? (
                    <div className="activity-empty">
                      <span className="empty-tray" aria-hidden="true" />
                      <p>Chưa có kết quả AI. Kết quả hợp lệ hoặc bị từ chối sẽ hiện tại đây.</p>
                    </div>
                  ) : (
                    <div className="activity-list" aria-live="polite">
                      {recentActivityRows}
                    </div>
                  )}
                  <p className="activity-note">AI camera xác định loại bao bì; điểm được cộng vào ví khi phiên được chốt.</p>
                </section>

                <div className="infeed-footer">
                  {scannerError && <p className="kiosk-scanner-error infeed-error" role="alert">{scannerError}</p>}
                  {finishWaitExpired && (
                    <div className="kiosk-scanner-error infeed-error" role="status">
                    Pi chưa chốt lượt sau 20 giây. Điểm chưa được cộng; hãy kiểm tra camera AI và kết nối API, rồi thử đồng bộ lại.
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-kiosk-touch btn-kiosk-lime finish-session-action"
                    onClick={async () => {
                      const accepted = await requestFinish();
                      if (accepted && finishWaitExpired) await refreshKiosk();
                    }}
                    disabled={requestingFinish || (finishRequested && !finishWaitExpired)}
                  >
                    {requestingFinish
                      ? 'Đang gửi yêu cầu…'
                      : finishRequested
                        ? finishWaitExpired ? 'Thử đồng bộ lại' : 'Máy đang chốt lượt…'
                        : 'Kết thúc lượt gửi'}
                  </button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="receipt-screen">
                <div className="screen-heading">
                  <div className="verification-mark" aria-hidden="true">
                    <svg viewBox="0 0 32 32"><path d="M16 3 27 8v8c0 7-5 11-11 14C10 27 5 23 5 16V8l11-5Z" /><path d="m11 16 3 3 7-8" /></svg>
                  </div>
                  <h1 className="kiosk-title">{returnToMethodAfterFinish ? 'Đang kết thúc lượt gửi' : 'Đang xác nhận lượt gửi'}</h1>
                  <p className="kiosk-copy">
                    {returnToMethodAfterFinish
                      ? 'Kiosk sẽ quay lại chọn cách dùng sau khi máy chủ chốt kết quả và điểm.'
                      : 'Đang chờ máy chủ chốt kết quả AI và cộng điểm vào ví.'}
                  </p>
                </div>

                <div className="kiosk-receipt-box">
                  <div className="kiosk-receipt-head">
                    <div>
                      <h2>Phiên thu gom</h2>
                      <span>Trạm {machine?.machine_code ?? 'RVM'} · {machine?.location_name ?? 'Đang cập nhật'}</span>
                      {mode === 'member' && customer && <span className="receipt-customer">{customer.fullName} · {customer.maskedEmail}</span>}
                    </div>
                    <span className="receipt-session">#{sessionId}</span>
                  </div>
                  <div className="kiosk-receipt-row">
                    <span>Nhận thưởng</span>
                    <strong>{mode === 'member' ? 'Cộng vào ví thành viên' : 'Phiên khách · không cộng vào ví'}</strong>
                  </div>
                  <div className="kiosk-receipt-row">
                    <span>Số bao bì hợp lệ</span>
                    <strong>{items}</strong>
                  </div>
                  <div className="kiosk-receipt-total">
                    <span>Điểm tạm tính</span>
                    <strong>+{pointsEarned}</strong>
                  </div>
                  {mode === 'member' && customer && (
                    <div className="receipt-wallet-status">
                      <span>Ví hiện tại</span>
                      <strong>{customer.walletBalance.toLocaleString('vi-VN')} điểm</strong>
                      <small>Điểm của lượt này sẽ cộng sau khi chốt.</small>
                    </div>
                  )}
                  <section className="receipt-activity" aria-label="Kết quả AI đã ghi nhận">
                    <div className="activity-heading">
                      <h3>AI đã nhận diện</h3>
                      <span>{recentFeed.length} lượt gần nhất</span>
                    </div>
                    {recentFeed.length ? (
                      <div className="receipt-activity-list" aria-live="polite">{recentActivityRows}</div>
                    ) : (
                      <p className="receipt-activity-empty">Chưa có bao bì được camera AI ghi nhận trong phiên này.</p>
                    )}
                  </section>
                </div>

                {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}
                {finishWaitExpired && (
                  <div className="kiosk-scanner-error" role="status">
                    Pi chưa hoàn tất lượt sau 20 giây. Kiểm tra camera AI và kết nối API; dữ liệu điểm chưa được xác nhận.
                    <button type="button" className="btn-kiosk-touch" onClick={() => void refreshKiosk()} disabled={refreshingStatus}>
                      {refreshingStatus ? 'Đang kiểm tra…' : 'Kiểm tra trạng thái'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="complete-screen">
                <div className="complete-icon" aria-hidden="true">
                  <svg viewBox="0 0 40 40"><path d="m9 20 7 7 15-16" /></svg>
                </div>
                <h1 className="kiosk-title">Đã gửi thành công</h1>
                <p className="kiosk-copy">
                  {mode === 'member'
                    ? 'Ví BravoForest của bạn đã được cộng ' + (finalPoints ?? 0) + ' điểm.'
                    : 'Phiên khách đã được lưu. ' + (finalPoints ?? 0) + ' điểm không cộng vào ví.'}
                </p>
                <div className="complete-summary">
                  <span>{items} bao bì hợp lệ</span>
                  <span>Phiên #{sessionId}</span>
                  {mode === 'member' && customer && <span>{customer.fullName} · {customer.maskedEmail}</span>}
                  {customer && <span>Ví hiện có {customer.walletBalance.toLocaleString('vi-VN')} điểm</span>}
                </div>
                <p className="complete-session-expiry">
                  {mode === 'member'
                    ? 'Bấm “Bỏ thêm vỏ” để dùng cùng tài khoản. Máy tự đăng xuất sau 5 phút không thao tác.'
                    : 'Máy tự quay về màn hình đầu sau 5 phút không thao tác.'}
                </p>
                {scannerError && <p className="kiosk-scanner-error" role="alert">{scannerError}</p>}
                <button className="btn-kiosk-touch btn-kiosk-lime complete-action" onClick={() => void startAnotherDeposit()} disabled={linking}>
                  {linking ? 'Đang mở phiên…' : 'Bỏ thêm vỏ'}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="kiosk-camera-panel" aria-label="Camera nhận diện bao bì">
          <div className="kiosk-camera-heading">
            <div>
              <strong>Camera AI trực tiếp</strong>
            </div>
            <span className={'kiosk-camera-status' + (cameraConnected && cameraImageLoaded && !cameraStreamFailed ? ' is-live' : '')}>
              <i aria-hidden="true" />{cameraConnected && cameraImageLoaded && !cameraStreamFailed ? 'TRỰC TIẾP' : 'ĐANG KẾT NỐI'}
            </span>
          </div>
          <div className="kiosk-camera-frame">
            <img
              key={cameraRetry}
              className={cameraConnected && cameraImageLoaded && !cameraStreamFailed ? 'is-connected' : 'is-connecting'}
              src={`http://127.0.0.1:8765/stream.mjpg?retry=${cameraRetry}`}
              alt="Hình ảnh trực tiếp từ camera máy RVM"
              crossOrigin="anonymous"
              onLoad={() => setCameraImageLoaded(true)}
              onError={() => {
                setCameraImageLoaded(false);
                setCameraStreamFailed(true);
              }}
            />
            {(!cameraConnected || !cameraImageLoaded || cameraStreamFailed) && (
              <div className="kiosk-camera-placeholder" role="status">
                <span className="kiosk-camera-spinner" aria-hidden="true" />
                <span>Đang kết nối camera…</span>
              </div>
            )}
          </div>
          <p className="kiosk-camera-note" aria-live="polite">
            {step === 3 || step === 4
              ? 'Kết quả AI chỉ hiện sau khi được lưu vào phiên gửi.'
              : step === 5
                ? 'Kết quả của phiên vừa hoàn tất đã được lưu trên máy chủ.'
                : 'Hãy mở phiên gửi trước khi đưa bao bì vào máy; lượt ngoài phiên không được ghi.'}
          </p>
        </aside>

      </div>
    </main>
  );
}
