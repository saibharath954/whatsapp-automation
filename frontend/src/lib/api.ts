/**
 * API client with automatic JWT Bearer injection and silent refresh on 401.
 *
 * Usage:
 *   import { api } from '../lib/api';
 *   const data = await api.get<{ orgs: Org[] }>('/api/admin/orgs');
 *   const result = await api.post<{ user: User }>('/api/auth/login', { email, password });
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

let accessToken: string | null = null;
let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: Error) => void }> = [];

// ─── Token management ───

export function setAccessToken(token: string | null) {
    accessToken = token;
}

export function getAccessToken(): string | null {
    return accessToken;
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
        credentials: 'include', // Sends HTTP-only cookies (refresh token)
        body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 401 — attempt silent refresh
    if (res.status === 401) {
        const errorBody = await res.json().catch(() => ({}));

        // Only attempt refresh if token expired (not if credentials are wrong)
        if (errorBody.code === 'TOKEN_EXPIRED' || (accessToken && !url.includes('/auth/'))) {
            const newToken = await silentRefresh();
            if (newToken) {
                // Retry original request with new token
                const retryRes = await fetch(url, {
                    method,
                    headers: { ...headers, Authorization: `Bearer ${newToken}` },
                    credentials: 'include',
                    body: body ? JSON.stringify(body) : undefined,
                });

                if (!retryRes.ok) {
                    const retryError = await retryRes.json().catch(() => ({ error: 'Request failed' }));
                    throw new ApiError(retryRes.status, retryError.error || 'Request failed', retryError);
                }

                return retryRes.json() as Promise<T>;
            }
        }

        // Refresh failed or not applicable — throw auth error
        throw new ApiError(401, errorBody.error || 'Unauthorized', errorBody);
    }

    if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new ApiError(res.status, errorBody.error || 'Request failed', errorBody);
    }

    // Handle 204 No Content
    if (res.status === 204) return {} as T;

    return res.json() as Promise<T>;
}

// ─── Silent refresh (with queue to prevent concurrent refreshes) ───

async function silentRefresh(): Promise<string | null> {
    if (isRefreshing) {
        // Another refresh is in progress — queue this request
        return new Promise<string>((resolve, reject) => {
            refreshQueue.push({ resolve, reject });
        });
    }

    isRefreshing = true;

    try {
        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include', // Sends the HTTP-only refresh cookie
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        if (!res.ok) {
            // Refresh failed — clear token and reject all queued requests
            accessToken = null;
            refreshQueue.forEach(({ reject }) => reject(new Error('Refresh failed')));
            refreshQueue = [];
            return null;
        }

        const data = await res.json();
        accessToken = data.accessToken;

        // Resolve all queued requests with the new token
        refreshQueue.forEach(({ resolve }) => resolve(data.accessToken));
        refreshQueue = [];

        return data.accessToken;
    } catch {
        accessToken = null;
        refreshQueue.forEach(({ reject }) => reject(new Error('Refresh failed')));
        refreshQueue = [];
        return null;
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
