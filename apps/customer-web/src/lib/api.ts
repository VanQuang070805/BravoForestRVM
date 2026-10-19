const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
const tokenKey = 'bravoforest_access_token';
const signedOutKey = 'bravoforest_signed_out';
const refreshLockName = 'bravoforest:customer-auth-refresh:v1';
const noRefreshPaths = new Set([
  '/auth/login',
  '/auth/customer/login',
  '/auth/register',
  '/auth/register/verify',
  '/auth/password-reset/request',
  '/auth/password-reset/verify',
  '/auth/password-reset/confirm',
  '/auth/refresh',
  '/auth/customer/refresh',
  '/auth/logout',
  '/auth/customer/logout',
]);
let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function token() {
  if (typeof window === 'undefined') return null;
  // Remove access tokens left by older versions; credentials now live only in memory.
  removeStored(tokenKey);
  return accessToken;
}

function removeStored(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Authentication still works when browser storage is disabled.
  }
}

function readStored(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The access token is memory-only; this marker is only a convenience.
  }
}

function saveToken(value?: string) {
  if (typeof window === 'undefined') return;
  accessToken = value ?? null;
  removeStored(tokenKey);
}

function isSignedOut() {
  return typeof window !== 'undefined' && readStored(signedOutKey) === '1';
}

function clearSignedOut() {
  if (typeof window !== 'undefined') removeStored(signedOutKey);
}

function refreshWithCookie() {
  if (!base) throw new ApiError('Thiếu NEXT_PUBLIC_API_URL.', 503);
  return fetch(`${base}/auth/customer/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'include',
    body: '{}',
  }).then((response) => decode<{ accessToken: string }>(response));
}

function refreshAccessToken() {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(refreshLockName, refreshWithCookie);
  }
  return refreshWithCookie();
}

async function decode<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Yêu cầu thất bại (${response.status})`;
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
  if (current) headers.set('Authorization', `Bearer ${current}`);

  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (response.status === 401 && retry && !noRefreshPaths.has(path) && !isSignedOut()) {
    try {
      const auth = await refreshAccessToken();
      if (isSignedOut()) throw new ApiError('Phiên đăng nhập đã kết thúc.', 401);
      saveToken(auth.accessToken);
      return request<T>(path, init, false);
    } catch {
      markSignedOut();
      throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    }
  }

  const result = await decode<T>(response);
  if (path === '/auth/login' || path === '/auth/customer/login' || path === '/auth/register/verify') clearSignedOut();
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

export function setAccessToken(value: string) {
  saveToken(value);
}

export function markSignedOut() {
  if (typeof window !== 'undefined') {
    saveToken();
    writeStored(signedOutKey, '1');
  }
}
