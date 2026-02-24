import { Navigate } from 'react-router-dom';
import { useAuth, type UserRole } from './AuthProvider';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    /** Roles allowed to access this route. If omitted, any authenticated user can access. */
    allowedRoles?: UserRole[];
}

/** Returns the default landing page for a given role */
export function getDefaultRoute(role: UserRole): string {
    switch (role) {
        case 'SUPER_ADMIN': return '/';
        case 'ORG_ADMIN': return '/';
        case 'AGENT': return '/escalations';
    }
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading, user, hasRole } = useAuth();

    // ── Loading: show spinner ──
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

    // ── Not authenticated → /login ──
    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    // ── Role check: redirect to default landing if forbidden ──
    if (allowedRoles && !hasRole(allowedRoles)) {
        return <Navigate to={getDefaultRoute(user.role)} replace />;
    }

    return <>{children}</>;
}
