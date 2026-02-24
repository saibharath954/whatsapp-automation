/**
 * Hardened API client with:
 *  - Automatic Bearer token injection on all /api/* requests
 *  - 401 interception with queued silent refresh (single refresh for N concurrent 401s)
 *  - Logout callback to clear AuthProvider state when refresh fails
 *  - Fastify-compatible refresh POST (body: '{}', credentials: 'include')
 *
 * Usage:
 *   import { api } from '../lib/api';
 *   const data = await api.get<{ orgs: Org[] }>('/api/admin/orgs');
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// ─── In-memory token ───
let accessToken: string | null = null;

// ─── Refresh queue state ───
let isRefreshing = false;
let refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
}> = [];

// ─── Logout callback (set by AuthProvider) ───
let onAuthFailure: (() => void) | null = null;

export function setAccessToken(token: string | null) {
    accessToken = token;
}

export function getAccessToken(): string | null {
    return accessToken;
}

/**
 * Register a callback that fires when refresh fails (session expired).
 * AuthProvider uses this to clear user state and redirect to /login.
 */
export function setOnAuthFailure(cb: () => void) {
    onAuthFailure = cb;
}

// ─── Core fetch wrapper ───

async function request<T>(method: HttpMethod, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, {
        method,
        headers,
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // ── Handle 401 — attempt silent refresh ──
    if (res.status === 401) {
        const errorBody = await res.json().catch(() => ({}));

        // Don't refresh on auth endpoints themselves (login, register)
        // DO refresh if we had a token and it expired, or server says TOKEN_EXPIRED
        const isAuthEndpoint = url.includes('/api/auth/login') || url.includes('/api/auth/register');

        if (!isAuthEndpoint && (errorBody.code === 'TOKEN_EXPIRED' || accessToken)) {
            try {
                const newToken = await silentRefresh();

                // Retry the original request with the fresh token
                const retryRes = await fetch(url, {
                    method,
                    headers: { ...headers, Authorization: `Bearer ${newToken}` },
                    credentials: 'include',
                    body: body !== undefined ? JSON.stringify(body) : undefined,
                });

                if (!retryRes.ok) {
                    const retryErr = await retryRes.json().catch(() => ({ error: 'Request failed' }));
                    throw new ApiError(retryRes.status, retryErr.error || 'Request failed', retryErr);
                }

                if (retryRes.status === 204) return {} as T;
                return retryRes.json() as Promise<T>;
            } catch (err) {
                // If refresh itself threw (session dead), propagate logout
                if (err instanceof RefreshFailedError) {
                    onAuthFailure?.();
                    throw new ApiError(401, 'Session expired', { code: 'SESSION_EXPIRED' });
                }
                throw err;
            }
        }

        // Auth endpoint failure or no token — throw directly
        throw new ApiError(401, errorBody.error || 'Unauthorized', errorBody);
    }

    // ── Handle other errors ──
    if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new ApiError(res.status, errorBody.error || 'Request failed', errorBody);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
}

// ─── Silent refresh with request queue ───
// When multiple requests get 401 simultaneously, only ONE refresh fires.
// The rest queue up and resolve once the single refresh completes.

class RefreshFailedError extends Error {
    constructor() { super('Refresh failed'); this.name = 'RefreshFailedError'; }
}

async function silentRefresh(): Promise<string> {
    if (isRefreshing) {
        // Park this caller until the in-flight refresh resolves
        return new Promise<string>((resolve, reject) => {
            refreshQueue.push({ resolve, reject });
        });
    }

    isRefreshing = true;

    try {
        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: '{}', // Fastify requires a JSON body
        });

        if (!res.ok) {
            accessToken = null;
            const err = new RefreshFailedError();
            refreshQueue.forEach(({ reject }) => reject(err));
            refreshQueue = [];
            throw err;
        }

        const data = await res.json();
        accessToken = data.accessToken;

        // Unblock all queued callers
        refreshQueue.forEach(({ resolve }) => resolve(data.accessToken));
        refreshQueue = [];

        return data.accessToken;
    } catch (err) {
        accessToken = null;
        const error = err instanceof RefreshFailedError ? err : new RefreshFailedError();
        refreshQueue.forEach(({ reject }) => reject(error));
        refreshQueue = [];
        throw error;
    } finally {
        isRefreshing = false;
    }
}

// ─── Public API ───

export const api = {
    get: <T>(url: string) => request<T>('GET', url),
    post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
    put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
    patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
    delete: <T>(url: string, body?: unknown) => request<T>('DELETE', url, body),
};

// ─── Error class ───

export class ApiError extends Error {
    public status: number;
    public data: unknown;

    constructor(status: number, message: string, data?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}
