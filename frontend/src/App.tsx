import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
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
} from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import KnowledgeBase from './pages/KnowledgeBase';
import Automations from './pages/Automations';
import Escalations from './pages/Escalations';
import ChatView from './pages/ChatView';
import type { ComponentType } from 'react';

interface NavItem {
    path: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/sessions', label: 'Sessions', icon: Smartphone },
    { path: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
    { path: '/automations', label: 'Automations', icon: Settings },
    { path: '/escalations', label: 'Escalations', icon: Bell },
    { path: '/chat', label: 'Chat View', icon: MessageSquare },
];

const pageNames: Record<string, string> = {
    '/': 'Dashboard',
    '/sessions': 'Sessions',
    '/knowledge-base': 'Knowledge Base',
    '/automations': 'Automations',
    '/escalations': 'Escalations',
    '/chat': 'Chat View',
};

function Header({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const location = useLocation();
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

            <div className="ml-auto flex items-center gap-2">
                <ThemeToggle />
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    A
                </div>
            </div>
        </header>
    );
}

export default function App() {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <BrowserRouter>
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

                    {/* Nav */}
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

                    {/* Footer */}
                    <div className={`border-t border-sidebar-border py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
                        <div className={`flex items-center gap-3 rounded-lg px-2 py-2 ${collapsed ? 'justify-center' : ''}`}>
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">
                                A
                            </div>
                            {!collapsed && (
                                <div className="overflow-hidden">
                                    <p className="text-xs font-medium text-sidebar-foreground truncate">Admin User</p>
                                    <p className="text-[10px] text-muted-foreground truncate">admin@demo.com</p>
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* ── Main ── */}
                <div className="flex flex-1 flex-col overflow-hidden">
                    <Header collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
                    <main className="flex-1 overflow-y-auto">
                        <div className="mx-auto max-w-6xl p-6 lg:p-8">
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/sessions" element={<Sessions />} />
                                <Route path="/knowledge-base" element={<KnowledgeBase />} />
                                <Route path="/automations" element={<Automations />} />
                                <Route path="/escalations" element={<Escalations />} />
                                <Route path="/chat" element={<ChatView />} />
                            </Routes>
                        </div>
                    </main>
                </div>
            </div>
        </BrowserRouter>
    );
}
