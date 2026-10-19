const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
const tokenKey = 'bravoforest_admin_token';
const signedOutKey = 'bravoforest_admin_signed_out';
const refreshLockName = 'bravoforest:admin-auth-refresh:v1';
const noRefreshPaths = new Set([
  '/auth/login',
  '/auth/admin/login',
  '/auth/register',
  '/auth/register/verify',
  '/auth/password-reset/request',
  '/auth/password-reset/verify',
  '/auth/password-reset/confirm',
  '/auth/refresh',
  '/auth/admin/refresh',
  '/auth/logout',
  '/auth/admin/logout',
]);
let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function token() {
  if (typeof window === 'undefined') return null;
  if (!accessToken) {
    accessToken = readStored(tokenKey);
  }
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
    // Storage fallback
  }
}

function saveToken(value?: string) {
  if (typeof window === 'undefined') return;
  accessToken = value ?? null;
  if (value) {
    writeStored(tokenKey, value);
  } else {
    removeStored(tokenKey);
  }
}

export function getCachedAdminUser<T = any>(): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem('bravoforest_admin_user');
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function setCachedAdminUser(u?: any) {
  if (typeof window === 'undefined') return;
  try {
    if (u) window.sessionStorage.setItem('bravoforest_admin_user', JSON.stringify(u));
    else window.sessionStorage.removeItem('bravoforest_admin_user');
  } catch {}
}

function isSignedOut() {
  return typeof window !== 'undefined' && readStored(signedOutKey) === '1';
}

function clearSignedOut() {
  if (typeof window !== 'undefined') removeStored(signedOutKey);
}

const apiErrorTranslations: Record<string, string> = {
  'invalid credentials': 'Tên đăng nhập hoặc mật khẩu không chính xác.',
  'account is inactive': 'Tài khoản đã bị khóa hoặc không còn hoạt động.',
  'credentials changed. please sign in again.': 'Thông tin đăng nhập đã thay đổi. Vui lòng đăng nhập lại.',
  'refresh session was revoked or already used': 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.',
  'refresh token is required': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'invalid or expired refresh token': 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
  'invalid refresh token': 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  unauthorized: 'Vui lòng đăng nhập để tiếp tục.',
  'forbidden resource': 'Bạn không có quyền thực hiện thao tác này.',
  'origin rejected': 'Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.',
  'internal server error': 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
  'too many requests': 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.',
  'throttlerexception: too many requests': 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.',
  'no changes supplied': 'Chưa có thay đổi nào để lưu.',
  'unknown role': 'Vai trò tài khoản không hợp lệ.',
  'email or phone already exists': 'Email hoặc số điện thoại đã được sử dụng.',
  'phone number already exists': 'Số điện thoại đã được sử dụng.',
  'user not found': 'Không tìm thấy tài khoản.',
  'admin accounts cannot be demoted or deleted through user management': 'Không thể hạ quyền hoặc xóa tài khoản quản trị tại đây.',
  'invalid user status': 'Trạng thái tài khoản không hợp lệ.',
  'you cannot disable your own admin account': 'Bạn không thể tự khóa tài khoản quản trị đang đăng nhập.',
  'admin accounts cannot be deleted': 'Không thể xóa tài khoản quản trị.',
  'the last active admin account cannot be locked': 'Không thể khóa tài khoản quản trị đang hoạt động cuối cùng.',
  'invalid alert status': 'Trạng thái cảnh báo không hợp lệ.',
  'alert not found': 'Không tìm thấy cảnh báo.',
  'machine not found': 'Không tìm thấy máy RVM.',
  'invalid setting key': 'Mã cấu hình không hợp lệ.',
  'invalid partner status': 'Trạng thái đối tác không hợp lệ.',
  'invalid credential reference': 'Mã tham chiếu thông tin xác thực không hợp lệ.',
  'partner not found': 'Không tìm thấy đối tác.',
  'invalid partner api url': 'Địa chỉ API của đối tác không hợp lệ.',
  'partner api url must be an http(s) base url without credentials, query, or fragment': 'Địa chỉ API phải là URL HTTP(S), không chứa thông tin đăng nhập, tham số hoặc đoạn neo.',
  'partner api url must use https': 'Địa chỉ API của đối tác phải sử dụng HTTPS.',
  'partner api host is not on the production allowlist': 'Máy chủ API của đối tác chưa được cho phép trong cấu hình triển khai.',
  'invalid voucher status': 'Trạng thái ưu đãi không hợp lệ.',
  'partner is unavailable': 'Đối tác hiện không khả dụng.',
  'voucher category not found': 'Không tìm thấy danh mục ưu đãi.',
  'voucher not found': 'Không tìm thấy ưu đãi.',
  'availableto must be after availablefrom': 'Ngày kết thúc phải sau ngày bắt đầu áp dụng.',
  '1 to 1000 voucher codes are required': 'Cần nhập từ 1 đến 1.000 mã ưu đãi.',
  'each code must contain 1 to 100 characters': 'Mỗi mã ưu đãi phải có từ 1 đến 100 ký tự.',
  'codes can only be added to code_pool vouchers': 'Chỉ có thể thêm mã cho ưu đãi dạng mã dùng một lần.',
  'adding these codes would exceed the voucher stock limit': 'Số mã thêm vào vượt quá giới hạn tồn kho của ưu đãi.',
  'validto must be after validfrom': 'Ngày kết thúc quy tắc phải sau ngày bắt đầu.',
  'container type is unavailable': 'Loại bao bì hiện không khả dụng.',
  'point rule period overlaps an existing rule': 'Thời hạn quy tắc điểm bị trùng với quy tắc hiện có.',
  'invalid session status': 'Trạng thái lượt gửi không hợp lệ.',
  'invalid redemption status': 'Trạng thái giao dịch đổi quà không hợp lệ.',
  'redemption not found': 'Không tìm thấy giao dịch đổi quà.',
  'only issued vouchers can be marked as used': 'Chỉ có thể đánh dấu ưu đãi đã cấp là đã sử dụng.',
  'minweightg must not exceed maxweightg': 'Cân nặng tối thiểu không được lớn hơn cân nặng tối đa.',
  'latitude and longitude must be provided together': 'Cần nhập cả vĩ độ và kinh độ.',
  'google geocoding request failed': 'Không thể tra cứu tọa độ địa chỉ.',
  'address could not be geocoded': 'Không tìm được tọa độ cho địa chỉ này.',
  'provide map coordinates or configure google_maps_server_api_key': 'Hãy nhập tọa độ bản đồ hoặc cấu hình khóa Google Maps trên máy chủ.',
  'a decommissioned machine cannot be edited': 'Không thể chỉnh sửa máy đã ngừng hoạt động.',
  'machine has an active recycling session': 'Máy đang có lượt gửi chưa hoàn tất.',
  'material not found': 'Không tìm thấy loại vật liệu.',
  'machine bin not found': 'Không tìm thấy khoang chứa của máy.',
  'machine not found or decommissioned': 'Không tìm thấy máy hoặc máy đã ngừng hoạt động.',
  'machine key not found': 'Không tìm thấy khóa xác thực của máy.',
  'active location not found': 'Không tìm thấy địa điểm đang hoạt động.',
  'machine already has an active location': 'Máy đã được gán một địa điểm hoạt động.',
  'active bin does not belong to this machine': 'Khoang chứa đang chọn không thuộc máy này.',
  'invalid cash-out status': 'Trạng thái yêu cầu đổi tiền không hợp lệ.',
  'cash-out request not found': 'Không tìm thấy yêu cầu đổi điểm thành tiền.',
  'complete every conversion and limit field before enabling cash-outs': 'Hãy điền đầy đủ tỷ lệ quy đổi và các hạn mức trước khi bật tính năng đổi tiền.',
  'minimum and maximum point limits must be multiples of the conversion step': 'Hạn mức điểm tối thiểu và tối đa phải là bội số của bước quy đổi.',
  'daily limit must be at least the per-request limit, and the latter must be at least the minimum': 'Hạn mức ngày phải lớn hơn hoặc bằng hạn mức mỗi lần; hạn mức mỗi lần phải lớn hơn hoặc bằng mức tối thiểu.',
  'the configured daily payout exceeds the supported amount': 'Tổng tiền chi trả trong ngày vượt quá giới hạn hệ thống hỗ trợ.',
  'idempotency key already belongs to another account': 'Mã yêu cầu này đã được dùng cho tài khoản khác.',
  'only requests awaiting review can be approved': 'Chỉ có thể duyệt yêu cầu đang chờ xét duyệt.',
  'only approved requests can be marked as paid': 'Chỉ có thể đánh dấu đã thanh toán cho yêu cầu đã duyệt.',
  'only approved requests with a confirmed failed transfer can be refunded': 'Chỉ có thể hoàn điểm cho yêu cầu đã duyệt và xác nhận chuyển tiền thất bại.',
  'only requests awaiting review can be rejected': 'Chỉ có thể từ chối yêu cầu đang chờ xét duyệt.',
};

function localizeApiError(value: unknown, status: number): string {
  if (Array.isArray(value)) {
    const messages = value.map((item) => localizeApiError(item, status)).filter(Boolean);
    return messages.length ? messages.join(' ') : fallbackApiError(status);
  }
  if (typeof value !== 'string' || !value.trim()) return fallbackApiError(status);

  const message = value.trim();
  const translated = apiErrorTranslations[message.toLowerCase()];
  if (translated) return translated;

  const validation = message.match(/^([a-zA-Z][a-zA-Z0-9_]*) must (?:be|contain|match|not be|not contain|not match|not exist|not equal)(?:\b|\s)/i);
  if (validation) {
    const labels: Record<string, string> = {
      identifier: 'tên đăng nhập hoặc email',
      password: 'mật khẩu',
      email: 'email',
      phone: 'số điện thoại',
      fullname: 'họ và tên',
      code: 'mã xác nhận',
    };
    return 'Thông tin ' + (labels[validation[1].toLowerCase()] ?? 'đã nhập') + ' chưa hợp lệ. Vui lòng kiểm tra lại.';
  }

  // Keep API messages already written in Vietnamese; do not expose untranslated English.
  if (/[^\u0000-\u007f]/.test(message)) return message;
  return fallbackApiError(status);
}

function fallbackApiError(status: number) {
  if (status === 400) return 'Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại.';
  if (status === 401) return 'Tên đăng nhập, mật khẩu không đúng hoặc phiên đăng nhập đã hết hạn.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
  if (status === 409) return 'Yêu cầu không phù hợp với trạng thái dữ liệu hiện tại.';
  if (status === 429) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
  if (status >= 500) return 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
  return 'Không thể thực hiện yêu cầu. Vui lòng thử lại.';
}

function refreshWithCookie() {
  if (!base) throw new ApiError('Thiếu NEXT_PUBLIC_API_URL.', 503);
  return fetch(base + '/auth/admin/refresh', {
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

export function markSignedOut() {
  if (typeof window !== 'undefined') {
    saveToken();
    writeStored(signedOutKey, '1');
  }
}

async function decode<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = fallbackApiError(response.status);
    try {
      const body = await response.json();
      message = localizeApiError(body.message, response.status);
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

  let response: Response;
  try {
    response = await fetch(base + path, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.', 503);
  }

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
  if (path === '/auth/login' || path === '/auth/admin/login' || path === '/auth/register') clearSignedOut();
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
