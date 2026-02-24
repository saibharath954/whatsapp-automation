import { Navigate } from 'react-router-dom';
import { useAuth, type UserRole } from './AuthProvider';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    /** Roles allowed to access this route. If omitted, any authenticated user can access. */
    roles?: UserRole[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading, user, hasRole } = useAuth();

    // Show loading spinner while checking auth
    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Authenticating...</p>
                </div>
            </div>
        );
    }

    // Not authenticated → redirect to login
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Authenticated but wrong role → show forbidden or redirect
    if (roles && !hasRole(roles)) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="rounded-xl border border-border bg-card p-8 text-center max-w-md">
                    <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        You don't have permission to access this page.
                        Your role: <span className="font-mono text-xs bg-muted rounded px-1.5 py-0.5">{user?.role}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Required: {roles.join(', ')}
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
