const BASE_URL = 'http://localhost:3001';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Paths that are allowed to 401 as part of normal operation, so they must NOT trigger the global
 * redirect: /auth/me is the logged-out probe on mount.
 */
const NO_REDIRECT_ON_401 = ['/auth/me'];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    // An expired or missing session anywhere else means the whole app is unusable; bounce to the
    // login page rather than leaving the caller to render a broken screen. `apiClient` lives
    // outside React's tree and has no router context, so a full-page navigation is the simple
    // prototype-appropriate answer. The throw still happens so callers' catch blocks run.
    if (res.status === 401 && !NO_REDIRECT_ON_401.includes(path) && typeof window !== 'undefined') {
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
