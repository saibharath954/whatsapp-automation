import { useState, useMemo } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Smartphone,
    BookOpen,
    Settings,
    Bell,
    MessageSquare,
    PanelLeftClose,
    PanelLeft,
    ChevronRight,
    LogOut,
    Shield,
} from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import { ProtectedRoute, getDefaultRoute } from './components/ProtectedRoute';
import { useAuth, type UserRole } from './components/AuthProvider';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import KnowledgeBase from './pages/KnowledgeBase';
import Automations from './pages/Automations';
import Escalations from './pages/Escalations';
import ChatView from './pages/ChatView';
import Login from './pages/Login';
import type { ComponentType } from 'react';

// ─── Nav items with role visibility ───

interface NavItem {
    path: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    /** Which roles can see this link. If omitted, visible to all. */
    visibleTo?: UserRole[];
}

const allNavItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, visibleTo: ['SUPER_ADMIN', 'ORG_ADMIN'] },
    { path: '/sessions', label: 'Sessions', icon: Smartphone, visibleTo: ['SUPER_ADMIN', 'ORG_ADMIN'] },
    { path: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen, visibleTo: ['SUPER_ADMIN', 'ORG_ADMIN'] },
    { path: '/automations', label: 'Automations', icon: Settings, visibleTo: ['SUPER_ADMIN', 'ORG_ADMIN'] },
    { path: '/escalations', label: 'Escalations', icon: Bell },
    { path: '/chat', label: 'Chat View', icon: MessageSquare, visibleTo: ['SUPER_ADMIN', 'ORG_ADMIN'] },
];

const pageNames: Record<string, string> = {
    '/': 'Dashboard',
    '/sessions': 'Sessions',
    '/knowledge-base': 'Knowledge Base',
    '/automations': 'Automations',
    '/escalations': 'Escalations',
    '/chat': 'Chat View',
};

// ─── Role badge ───

function RoleBadge({ role }: { role: UserRole }) {
    const styles: Record<UserRole, string> = {
        SUPER_ADMIN: 'bg-purple-500/10 text-purple-500',
        ORG_ADMIN: 'bg-blue-500/10 text-blue-500',
        AGENT: 'bg-success/10 text-success',
    };
    const labels: Record<UserRole, string> = {
        SUPER_ADMIN: 'Super Admin',
        ORG_ADMIN: 'Org Admin',
        AGENT: 'Agent',
    };
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[role]}`}>
            <Shield className="h-2.5 w-2.5" />
            {labels[role]}
        </span>
    );
}

// ─── Header ───

function Header({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const location = useLocation();
    const { user } = useAuth();
    const pageName = pageNames[location.pathname] || 'Dashboard';

    return (
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/50 backdrop-blur-sm px-6">
            <button
                onClick={onToggle}
                className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>

            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>Admin</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{pageName}</span>
            </div>

            <div className="ml-auto flex items-center gap-3">
                {user && <RoleBadge role={user.role} />}
                <ThemeToggle />
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold" title={user?.email || ''}>
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
            </div>
        </header>
    );
}

// ─── App Shell (sidebar + main area) ───

function AppShell() {
    const [collapsed, setCollapsed] = useState(false);
    const { user, logout } = useAuth();

    // Filter nav items by current user's role
    const navItems = useMemo(() => {
        if (!user) return [];
        return allNavItems.filter(
            (item) => !item.visibleTo || item.visibleTo.includes(user.role)
        );
    }, [user]);

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
            {/* ── Sidebar ── */}
            <aside
                className={`flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out
            ${collapsed ? 'w-[68px]' : 'w-64'}`}
            >
                {/* Logo */}
                <div className={`flex items-center border-b border-sidebar-border h-14 shrink-0 ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-5'}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success text-success-foreground font-bold text-sm">
                        W
                    </div>
                    {!collapsed && (
                        <div className="overflow-hidden">
                            <h1 className="text-sm font-semibold text-sidebar-foreground whitespace-nowrap">WA Automation</h1>
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin</p>
                        </div>
                    )}
                </div>

                {/* Nav — filtered by role */}
                <nav className="flex-1 space-y-0.5 px-2 py-3 overflow-y-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.path === '/'}
                                title={collapsed ? item.label : undefined}
                                className={({ isActive }) =>
                                    `group relative flex items-center rounded-lg transition-all duration-150
                     ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'}
                     ${isActive
                                        ? 'bg-sidebar-accent text-sidebar-foreground font-semibold'
                                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                                    }`
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        {isActive && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-success" />
                                        )}
                                        <Icon className="h-[18px] w-[18px] shrink-0" />
                                        {!collapsed && <span className="text-sm whitespace-nowrap">{item.label}</span>}
                                    </>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Footer — user info + logout */}
                <div className={`border-t border-sidebar-border py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
                    <div className={`flex items-center gap-3 rounded-lg px-2 py-2 ${collapsed ? 'justify-center' : ''}`}>
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                            {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        {!collapsed && (
                            <div className="flex-1 overflow-hidden">
                                <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name || 'User'}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{user?.email || ''}</p>
                            </div>
                        )}
                        {!collapsed && (
                            <button
                                onClick={logout}
                                className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors focus:outline-none"
                                title="Sign out"
                            >
                                <LogOut className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {collapsed && (
                        <button
                            onClick={logout}
                            className="mt-1 flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors focus:outline-none"
                            title="Sign out"
                        >
                            <LogOut className="h-[18px] w-[18px]" />
                        </button>
                    )}
                </div>
            </aside>

            {/* ── Main content area ── */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
                <main className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-6xl p-6 lg:p-8">
                        <Routes>
                            {/* ── SUPER_ADMIN + ORG_ADMIN routes ── */}
                            <Route path="/" element={
                                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']}>
                                    <Dashboard />
                                </ProtectedRoute>
                            } />
                            <Route path="/sessions" element={
                                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']}>
                                    <Sessions />
                                </ProtectedRoute>
                            } />
                            <Route path="/knowledge-base" element={
                                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']}>
                                    <KnowledgeBase />
                                </ProtectedRoute>
                            } />
                            <Route path="/automations" element={
                                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']}>
                                    <Automations />
                                </ProtectedRoute>
                            } />
                            <Route path="/chat" element={
                                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN']}>
                                    <ChatView />
                                </ProtectedRoute>
                            } />

                            {/* ── All authenticated roles ── */}
                            <Route path="/escalations" element={<Escalations />} />

                            {/* ── Catch-all: redirect to role-based default ── */}
                            <Route path="*" element={
                                user ? <Navigate to={getDefaultRoute(user.role)} replace /> : <Navigate to="/login" replace />
                            } />
                        </Routes>
                    </div>
                </main>
            </div>
        </div>
    );
}

// ─── Root App ───

export default function App() {

    return (
        <BrowserRouter>
            <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />

                {/* Protected shell — any authenticated user */}
                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <AppShell />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}
