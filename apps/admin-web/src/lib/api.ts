const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
const tokenKey = 'bravoforest_admin_token';
const signedOutKey = 'bravoforest_admin_signed_out';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function token() {
  return typeof window === 'undefined' ? null : localStorage.getItem(tokenKey);
}

function saveToken(value?: string) {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(tokenKey, value);
  else localStorage.removeItem(tokenKey);
}

function isSignedOut() {
  return typeof window !== 'undefined' && localStorage.getItem(signedOutKey) === '1';
}

function clearSignedOut() {
  if (typeof window !== 'undefined') localStorage.removeItem(signedOutKey);
}

export function markSignedOut() {
  if (typeof window !== 'undefined') {
    saveToken();
    localStorage.setItem(signedOutKey, '1');
  }
}

async function decode<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = 'Yêu cầu thất bại (' + response.status + ')';
    try {
      const body = await response.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? message;
    } catch {
      // Keep the status-based message when the response has no JSON body.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  if (!base) throw new ApiError('Thiếu NEXT_PUBLIC_API_URL.', 503);

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const current = token();
  if (current) headers.set('Authorization', 'Bearer ' + current);

  const response = await fetch(base + path, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401 && retry && !path.startsWith('/auth/') && !isSignedOut()) {
    try {
      const refreshed = await fetch(base + '/auth/refresh', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      });
      const auth = await decode<{ accessToken: string }>(refreshed);
      if (isSignedOut()) throw new ApiError('Phiên đăng nhập đã kết thúc.', 401);
      saveToken(auth.accessToken);
      return request<T>(path, init, false);
    } catch {
      markSignedOut();
      throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
  }

  const result = await decode<T>(response);
  if (path === '/auth/login' || path === '/auth/register') clearSignedOut();
  return result;
}

export const apiGet = <T,>(path: string) => request<T>(path);

export const apiPost = <T,>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const apiPatch = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const apiDelete = <T,>(path: string) => request<T>(path, { method: 'DELETE' });

export function clearAccessToken() {
  saveToken();
}
