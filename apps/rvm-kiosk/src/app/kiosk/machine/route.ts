import { randomUUID } from 'crypto';

function machineHeaders(extra?: Record<string, string>) {
  const machineId = process.env.RVM_MACHINE_ID;
  const apiKey = process.env.RVM_API_KEY;
  if (!machineId || !/^\d+$/.test(machineId) || Number(machineId) < 1) {
    throw new Error('Mã máy RVM chưa được cấu hình đúng. Hãy kiểm tra RVM_MACHINE_ID.');
  }
  if (!apiKey || apiKey.length < 20 || /replace-with|your-api-key|change-me/i.test(apiKey)) {
    throw new Error('API key của máy RVM chưa được cấu hình đúng. Hãy cấp key trong trang quản trị.');
  }
  return {
    'content-type': 'application/json',
    'x-machine-id': machineId,
    'x-api-key': apiKey,
    'x-request-nonce': randomUUID(),
    'x-request-timestamp': String(Date.now()),
    ...extra,
  };
}

function apiUrl() {
  const configuredUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!configuredUrl) throw new Error('Chưa cấu hình địa chỉ API quản lý cho kiosk.');
  try {
    const parsed = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new Error('Địa chỉ API quản lý của kiosk không hợp lệ.');
  }
  return configuredUrl.replace(/\/$/, '');
}

async function proxy(upstream: Response) {
  const result = await upstream.json().catch(() => ({ message: 'API không trả về dữ liệu hợp lệ.' }));
  return Response.json(result, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
}

async function machineRequest(path: string, init?: RequestInit) {
  return fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: machineHeaders(init?.headers as Record<string, string> | undefined),
    cache: 'no-store',
    signal: init?.signal ?? AbortSignal.timeout(6000),
  });
}

function machineErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message && !/fetch failed|aborted|timeout/i.test(message)) return message;
  return 'Không thể kết nối máy chủ quản lý. Hãy kiểm tra API và kết nối mạng.';
}

function validSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,20}$/.test(value);
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (query.get('catalog') === '1') return proxy(await machineRequest('/machine/scan-options'));
    return Response.json({ message: 'Yêu cầu không hợp lệ.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json(
      { message: machineErrorMessage(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: string; mode?: string; sessionId?: string; statusToken?: string;
    };
    if (body.action === 'create') {
      const mode = body.mode === 'GUEST' ? 'GUEST' : body.mode === 'MEMBER' ? 'MEMBER' : null;
      if (!mode) return Response.json({ message: 'Phương thức giao dịch không hợp lệ.' }, { status: 400 });
      return proxy(await machineRequest('/machine/sessions', {
        method: 'POST', body: JSON.stringify({ mode }),
      }));
    }

    if (body.action === 'active-status') {
      if (body.sessionId !== undefined && !validSessionId(body.sessionId)) {
        return Response.json({ message: 'Phiên máy không hợp lệ.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
      }
      const query = body.sessionId ? `?sessionId=${encodeURIComponent(body.sessionId)}` : '';
      return proxy(await machineRequest(`/machine/sessions/active/status${query}`));
    }

    if (body.action === 'finish') {
      if (!validSessionId(body.sessionId)) {
        return Response.json({ message: 'Phiên máy không hợp lệ.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
      }
      return proxy(await machineRequest(`/machine/sessions/${encodeURIComponent(body.sessionId)}/finish`, {
        method: 'POST', body: '{}',
      }));
    }

    if (body.action === 'continue' || body.action === 'logout' || body.action === 'activity') {
      if (!validSessionId(body.sessionId) || typeof body.statusToken !== 'string' || !/^[a-f0-9]{64}$/i.test(body.statusToken)) {
        return Response.json({ message: 'Phiên máy không hợp lệ.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
      }
      return proxy(await machineRequest(`/machine/sessions/${encodeURIComponent(body.sessionId)}/${body.action}`, {
        method: 'POST',
        headers: { 'x-session-token': body.statusToken },
        body: '{}',
      }));
    }

    if (!validSessionId(body.sessionId) || typeof body.statusToken !== 'string' || !/^[a-f0-9]{64}$/i.test(body.statusToken)) {
      return Response.json({ message: 'Phiên máy không hợp lệ.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const sessionPath = `/machine/sessions/${encodeURIComponent(body.sessionId)}`;
    if (body.action === 'status') {
      return proxy(await machineRequest(`${sessionPath}/status`, { headers: { 'x-session-token': body.statusToken } }));
    }
    if (body.action === 'cancel') {
      return proxy(await machineRequest(`${sessionPath}/cancel`, {
        method: 'POST',
        headers: { 'x-session-token': body.statusToken },
        body: '{}',
      }));
    }
    return Response.json({ message: 'Yêu cầu không hợp lệ.' }, { status: 400 });
  } catch (error) {
    return Response.json(
      { message: machineErrorMessage(error) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
