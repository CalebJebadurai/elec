// In dev: proxied to http://api:8000 via Vite proxy → '/api'
// In prod (split deploy): full URL like 'https://elec-api.up.railway.app'
const BASE = import.meta.env.VITE_API_URL || '/api';

let _token = localStorage.getItem('auth_token');

function setToken(token) {
  _token = token;
  if (token) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
}

function getToken() {
  return _token;
}

function authHeaders() {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Election data
  stats: () => get('/stats/summary'),
  years: () => get('/years'),
  constituencies: () => get('/constituencies'),
  stateSwing: () => get('/swings/state'),
  constituencySwing: (name) => get(`/swings/constituency/${encodeURIComponent(name)}`),
  allConstituencySwings: () => get('/swings/constituencies'),
  parties: () => get('/parties'),
  predictionData: () => get('/predict/data'),

  // Auth
  verifyOtp: (mobile, firebase_id_token) =>
    post('/auth/verify-otp', { mobile, firebase_id_token }),
  linkGoogle: (google_id_token, google_access_token) =>
    post('/auth/google-link', { google_id_token, google_access_token }),
  getMe: () => get('/auth/me'),
  updateMe: (data) => put('/auth/me', data),

  // Bookmarks
  listBookmarks: () => get('/bookmarks'),
  listPublicBookmarks: (sort = 'recent') => get(`/bookmarks/public?sort=${sort}`),
  getBookmark: (id) => get(`/bookmarks/${id}`),
  createBookmark: (data) => post('/bookmarks', data),
  updateBookmark: (id, data) => put(`/bookmarks/${id}`, data),
  deleteBookmark: (id) => del(`/bookmarks/${id}`),
  voteBookmark: (id, vote_type) => post(`/bookmarks/${id}/vote`, { vote_type }),

  // Token management
  setToken,
  getToken,
};
