import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useRef,
    type ReactNode,
} from 'react';
import { api, setAccessToken, setOnAuthFailure } from '../lib/api';

// ─── Types ───

export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'AGENT';

export interface AuthUser {
    id: string;
    org_id: string | null;
    email: string;
    name: string;
    role: UserRole;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
}

interface AuthContextValue {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    /** Shortcut for user.org_id — used to scope API calls */
    orgId: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    /** Check if user has one of the specified roles */
    hasRole: (roles: UserRole[]) => boolean;
}

// ─── Context ───

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ───

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const logoutRef = useRef<() => void>(() => { });

    // Hard logout: clears token + user state. Called by api.ts when refresh fails.
    const hardLogout = useCallback(() => {
        setAccessToken(null);
        setUser(null);
    }, []);

    // Keep ref in sync so the api client always calls the latest version
    logoutRef.current = hardLogout;

    // Register the auth failure callback with the api client (once)
    useEffect(() => {
        setOnAuthFailure(() => logoutRef.current());
    }, []);

    // On mount, try to restore session via refresh token cookie
    useEffect(() => {
        let cancelled = false;
        async function restoreSession() {
            try {
                // Attempt silent refresh (uses HTTP-only cookie)
                const refreshRes = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                });

                if (!refreshRes.ok) {
                    // No valid session — just show login
                    if (!cancelled) setIsLoading(false);
                    return;
                }

                const { accessToken } = await refreshRes.json();
                setAccessToken(accessToken);

                // Fetch user profile with the new token
                const { user: userData } = await api.get<{ user: AuthUser }>('/api/auth/me');
                if (!cancelled) setUser(userData);
            } catch {
                // Session restore failed — user needs to login
                setAccessToken(null);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        restoreSession();
        return () => { cancelled = true; };
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const res = await api.post<{ user: AuthUser; accessToken: string }>(
            '/api/auth/login',
            { email, password }
        );
        setAccessToken(res.accessToken);
        setUser(res.user);
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/api/auth/logout');
        } catch {
            // Ignore logout errors — clear state regardless
        } finally {
            hardLogout();
        }
    }, [hardLogout]);

    const hasRole = useCallback(
        (roles: UserRole[]) => {
            if (!user) return false;
            return roles.includes(user.role);
        },
        [user]
    );

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                orgId: user?.org_id ?? null,
                login,
                logout,
                hasRole,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

// ─── Hook ───

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
