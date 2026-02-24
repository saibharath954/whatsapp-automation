import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    type ReactNode,
} from 'react';
import { api, setAccessToken } from '../lib/api';

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
                    // No valid session
                    setIsLoading(false);
                    return;
                }

                const { accessToken } = await refreshRes.json();
                setAccessToken(accessToken);

                // Fetch user profile
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
            // Ignore logout errors
        } finally {
            setAccessToken(null);
            setUser(null);
        }
    }, []);

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
