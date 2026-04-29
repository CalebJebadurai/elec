import type {
  StateInfo,
  StatsSummary,
  YearSummary,
  PartySummary,
  ConstituencySummary,
  StateSwingSummary,
  ConstituencySwing,
  ConstituencySwingRow,
  PredictionDataResponse,
  AuthResponse,
  User,
  UserProfile,
  Bookmark,
  NationalStateSummary,
  NationalPartyStrength,
  NationalTurnoutTrend,
  UpcomingElection,
  PartyMapEntry,
  SubscriptionOut,
  ApiKeyOut,
  ApiKeyCreated,
  UsageSummaryOut,
} from './types';

// In dev: proxied to http://api:8000 via Vite proxy → '/api'
// In prod (split deploy): full URL like 'https://elec-api.up.railway.app'
const BASE = import.meta.env.VITE_API_URL || '/api';
const V1 = '/v1';

let _token: string | null = localStorage.getItem('auth_token');

function setToken(token: string | null): void {
  _token = token;
  if (token) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
}

function getToken(): string | null {
  return _token;
}

function _getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  // Prefer Bearer token (backward compat + API keys)
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }
  return headers;
}

function _csrfHeaders(): Record<string, string> {
  const csrf = _getCsrfToken();
  return csrf ? { 'X-CSRF-Token': csrf } : {};
}

// ── In-memory cache for read-only endpoints ──────────────
interface CacheEntry {
  data?: unknown;
  ts: number;
  promise?: Promise<unknown>;
}
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function _cachedGet<T>(path: string): Promise<T> {
  const entry = _cache.get(path);
  if (entry && entry.data !== undefined && Date.now() - entry.ts < CACHE_TTL) {
    return Promise.resolve(entry.data as T);
  }
  // Deduplicate in-flight requests
  if (entry && entry.promise) return entry.promise as Promise<T>;
  const promise = get<T>(path)
    .then((data) => {
      _cache.set(path, { data, ts: Date.now() });
      return data;
    })
    .catch((err) => {
      _cache.delete(path);
      throw err;
    });
  _cache.set(path, { promise, ts: 0 });
  return promise;
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ..._csrfHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function put<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ..._csrfHeaders() },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function del<T = unknown>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), ..._csrfHeaders() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // State list (no state param — returns all states)
  states: (): Promise<StateInfo[]> => _cachedGet(`${V1}/states`),

  // Election data (state-scoped + election_type-scoped, cached)
  stats: (state: string, electionType = 'AE'): Promise<StatsSummary> =>
    _cachedGet(
      `${V1}/stats/summary?state=${encodeURIComponent(state)}&election_type=${electionType}`
    ),
  years: (state: string, electionType = 'AE'): Promise<YearSummary[]> =>
    _cachedGet(`${V1}/years?state=${encodeURIComponent(state)}&election_type=${electionType}`),
  constituencies: (state: string, electionType = 'AE'): Promise<ConstituencySummary[]> =>
    _cachedGet(
      `${V1}/constituencies?state=${encodeURIComponent(state)}&election_type=${electionType}`
    ),
  stateSwing: (state: string, electionType = 'AE'): Promise<StateSwingSummary[]> =>
    _cachedGet(
      `${V1}/swings/state?state=${encodeURIComponent(state)}&election_type=${electionType}`
    ),
  constituencySwing: (
    name: string,
    state: string,
    electionType = 'AE'
  ): Promise<ConstituencySwing> =>
    _cachedGet(
      `${V1}/swings/constituency/${encodeURIComponent(name)}?state=${encodeURIComponent(state)}&election_type=${electionType}`
    ),
  allConstituencySwings: (state: string, electionType = 'AE'): Promise<ConstituencySwingRow[]> =>
    _cachedGet(
      `${V1}/swings/constituencies?state=${encodeURIComponent(state)}&election_type=${electionType}`
    ),
  parties: (state: string, electionType = 'AE'): Promise<PartySummary[]> =>
    _cachedGet(`${V1}/parties?state=${encodeURIComponent(state)}&election_type=${electionType}`),

  // Predictions always AE — no election_type param
  predictionData: (state: string): Promise<PredictionDataResponse> =>
    _cachedGet(`${V1}/predict/data?state=${encodeURIComponent(state)}`),

  // Auth
  verifyOtp: (mobile: string, firebase_id_token: string): Promise<AuthResponse> =>
    post(`${V1}/auth/verify-otp`, { mobile, firebase_id_token }),
  logout: (): Promise<{ ok: boolean }> => post(`${V1}/auth/logout`, {}),
  linkGoogle: (google_id_token: string, google_access_token: string): Promise<{ ok: boolean }> =>
    post(`${V1}/auth/google-link`, { google_id_token, google_access_token }),
  getMe: (): Promise<User> => get(`${V1}/auth/me`),
  updateMe: (data: UserProfile): Promise<User> => put(`${V1}/auth/me`, data),

  // Bookmarks
  listBookmarks: (): Promise<Bookmark[]> => get(`${V1}/bookmarks`),
  listPublicBookmarks: (sort = 'recent'): Promise<Bookmark[]> =>
    get(`${V1}/bookmarks/public?sort=${sort}`),
  getBookmark: (id: number): Promise<Bookmark> => get(`${V1}/bookmarks/${id}`),
  createBookmark: (data: Record<string, unknown>): Promise<Bookmark> =>
    post(`${V1}/bookmarks`, data),
  updateBookmark: (id: number, data: Record<string, unknown>): Promise<Bookmark> =>
    put(`${V1}/bookmarks/${id}`, data),
  deleteBookmark: (id: number): Promise<null> => del(`${V1}/bookmarks/${id}`) as Promise<null>,
  voteBookmark: (id: number, vote_type: string): Promise<{ ok: boolean }> =>
    post(`${V1}/bookmarks/${id}/vote`, { vote_type }),

  // National dashboard
  nationalStateSummary: (electionType = 'AE'): Promise<NationalStateSummary[]> =>
    _cachedGet(`${V1}/national/state-summary?election_type=${electionType}`),
  nationalPartyStrength: (
    electionType = 'AE',
    yearMin?: number,
    yearMax?: number
  ): Promise<NationalPartyStrength[]> => {
    let url = `${V1}/national/party-strength?election_type=${electionType}`;
    if (yearMin) url += `&year_min=${yearMin}`;
    if (yearMax) url += `&year_max=${yearMax}`;
    return _cachedGet(url);
  },
  nationalTurnoutTrends: (electionType = 'GE'): Promise<NationalTurnoutTrend[]> =>
    _cachedGet(`${V1}/national/turnout-trends?election_type=${electionType}`),
  nationalUpcoming: (): Promise<UpcomingElection[]> =>
    _cachedGet(`${V1}/national/upcoming-elections`),
  nationalCompare: (
    stateA: string,
    stateB: string,
    electionType = 'AE'
  ): Promise<Record<string, unknown>> =>
    _cachedGet(
      `${V1}/national/compare?state_a=${encodeURIComponent(stateA)}&state_b=${encodeURIComponent(stateB)}&election_type=${electionType}`
    ),
  nationalPartyMap: (party: string, electionType = 'AE'): Promise<PartyMapEntry[]> =>
    _cachedGet(
      `${V1}/national/party-map?party=${encodeURIComponent(party)}&election_type=${electionType}`
    ),

  // Subscriptions
  createSubscription: (): Promise<SubscriptionOut> => post(`${V1}/subscriptions/create`, {}),
  mySubscription: (): Promise<SubscriptionOut> => get(`${V1}/subscriptions/me`),
  cancelSubscription: (): Promise<{ ok: boolean }> => post(`${V1}/subscriptions/cancel`, {}),

  // API keys
  listApiKeys: (): Promise<ApiKeyOut[]> => get(`${V1}/api-keys`),
  createApiKey: (label: string): Promise<ApiKeyCreated> => post(`${V1}/api-keys`, { label }),
  revokeApiKey: (id: number): Promise<null> => del(`${V1}/api-keys/${id}`) as Promise<null>,

  // CSV export
  exportCsv: (state: string, electionType = 'AE'): string =>
    `${BASE}${V1}/export/csv?state=${encodeURIComponent(state)}&election_type=${electionType}`,

  // DPDP
  exportMyData: (): Promise<unknown> => get(`${V1}/auth/users/me/data`),
  deleteMyAccount: (): Promise<null> => del(`${V1}/auth/users/me`) as Promise<null>,

  // Token management
  setToken,
  getToken,
};
