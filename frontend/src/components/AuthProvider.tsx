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
    /**
     * Resolved org ID for API calls.
     * - ORG_ADMIN / AGENT: user.org_id (from DB)
     * - SUPER_ADMIN: auto-resolved to first available org
     */
    orgId: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    hasRole: (roles: UserRole[]) => boolean;
}

// ─── Context ───

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Provider ───

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null);
    const logoutRef = useRef<() => void>(() => { });

    // Hard logout: clears token + user state
    const hardLogout = useCallback(() => {
        setAccessToken(null);
        setUser(null);
        setResolvedOrgId(null);
    }, []);

    logoutRef.current = hardLogout;

    // Register the auth failure callback with the api client (once)
    useEffect(() => {
        setOnAuthFailure(() => logoutRef.current());
    }, []);

    // When user changes, resolve orgId
    useEffect(() => {
        if (!user) {
            setResolvedOrgId(null);
            return;
        }

        // ORG_ADMIN / AGENT: orgId comes directly from the user record
        if (user.org_id) {
            setResolvedOrgId(user.org_id);
            return;
        }

        // SUPER_ADMIN: org_id is null → fetch first available org
        if (user.role === 'SUPER_ADMIN') {
            let cancelled = false;
            async function resolveOrg() {
                try {
                    const { orgs } = await api.get<{ orgs: { id: string }[] }>('/api/admin/orgs');
                    if (!cancelled && orgs.length > 0) {
                        setResolvedOrgId(orgs[0].id);
                    }
                } catch {
                    // Can't resolve org — orgId stays null
                }
            }
            resolveOrg();
            return () => { cancelled = true; };
        }
    }, [user]);

    // On mount, try to restore session via refresh token cookie
    useEffect(() => {
        let cancelled = false;
        async function restoreSession() {
            try {
                const refreshRes = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                });

                if (!refreshRes.ok) {
                    if (!cancelled) setIsLoading(false);
                    return;
                }

                const { accessToken } = await refreshRes.json();
                setAccessToken(accessToken);

                const { user: userData } = await api.get<{ user: AuthUser }>('/api/auth/me');
                if (!cancelled) setUser(userData);
            } catch {
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
            await api.post('/api/auth/logout', {});
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
                orgId: resolvedOrgId,
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
