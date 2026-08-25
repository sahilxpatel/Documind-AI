import axios from 'axios';

/**
 * Leave VITE_API_URL unset to call the API on the same origin as the page. That
 * is the deployed arrangement (the API serves this bundle) and it also works in
 * development, where the Vite dev server proxies /api to the local API.
 *
 * Set it only when the API lives on a different origin. It must then be the
 * *origin* only - every call site already includes the `/api` prefix, so a
 * trailing `/api` here would produce `/api/api/...`.
 *
 * Vite inlines this at build time, so an App Service application setting cannot
 * change an already-built bundle; it has to be present during `vite build`.
 */
const rawBaseUrl = import.meta.env.VITE_API_URL ?? '';

// Trailing slashes would produce `//api/...`; a trailing `/api` is a common
// misconfiguration worth correcting rather than failing on.
const baseURL = rawBaseUrl.trim().replace(/\/+$/, '').replace(/\/api$/, '');

const apiClient = axios.create({
  // Empty baseURL means relative requests, i.e. same origin.
  baseURL,
  timeout: 60_000,
  headers: { Accept: 'application/json' },
});

export const TOKEN_STORAGE_KEY = 'token';
export const USER_STORAGE_KEY = 'user';

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Notified when the server rejects the stored token, so AuthContext can reset. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';

    // A 401 from the login/register endpoints means "wrong credentials" and is
    // handled by the form. Anywhere else it means the stored token is no longer
    // valid, so clear it instead of leaving the UI in a fake signed-in state.
    const isAuthAttempt = url.includes('/api/auth/login') || url.includes('/api/auth/register');

    if (status === 401 && !isAuthAttempt) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      onUnauthorized?.();
    }

    return Promise.reject(error);
  },
);

export default apiClient;
