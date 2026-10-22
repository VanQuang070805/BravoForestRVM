import { randomUUID } from 'crypto';

function machineHeaders(extra?: Record<string, string>) {
  const machineId = process.env.RVM_MACHINE_ID;
  const apiKey = process.env.RVM_API_KEY;
  if (!machineId || !apiKey) throw new Error('Máy RVM chưa được cấu hình mã máy và API key.');
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
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
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
  });
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
      { message: error instanceof Error ? error.message : 'Không thể kết nối máy RVM.' },
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
      { message: error instanceof Error ? error.message : 'Không thể kết nối máy RVM.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
