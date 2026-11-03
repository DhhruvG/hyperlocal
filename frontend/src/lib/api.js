import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
export const API_BASE = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Attach bearer if present (fallback for cookieless environments)
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('lp_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return 'Something went wrong. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}
