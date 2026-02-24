import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
    Smartphone,
    Users,
    Bell,
    BookOpen,
    Server,
    Database,
    HardDrive,
    Sparkles,
    CheckCircle2,
    Circle,
} from 'lucide-react';

interface Stats {
    activeSessions: number;
    totalCustomers: number;
    pendingEscalations: number;
    kbDocuments: number;
}

const statCards = [
    { key: 'activeSessions', label: 'Active Sessions', icon: Smartphone, color: 'text-success' },
    { key: 'totalCustomers', label: 'Total Customers', icon: Users, color: 'text-blue-500' },
    { key: 'pendingEscalations', label: 'Pending Escalations', icon: Bell, color: 'text-warning' },
    { key: 'kbDocuments', label: 'KB Documents', icon: BookOpen, color: 'text-purple-500' },
] as const;

const services = [
    { name: 'API Server', detail: 'Fastify on port 3000', icon: Server, status: 'Healthy' },
    { name: 'Database', detail: 'PostgreSQL 16', icon: Database, status: 'Connected' },
    { name: 'Redis / Vector DB', detail: 'Redis Stack with RediSearch', icon: HardDrive, status: 'Connected' },
    { name: 'LLM Provider', detail: 'gemini-2.0-flash', icon: Sparkles, status: 'Gemini' },
];

export default function Dashboard() {
    const [stats, setStats] = useState<Stats>({
        activeSessions: 0,
        totalCustomers: 0,
        pendingEscalations: 0,
        kbDocuments: 0,
    });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [sessionsRes, escalationsRes] = await Promise.allSettled([
                    api.get<{ sessions: any[] }>('/api/admin/sessions'),
                    api.get<{ stats: any }>('/api/escalations/stats?orgId=550e8400-e29b-41d4-a716-446655440001'),
                ]);
                const sessions = sessionsRes.status === 'fulfilled' ? sessionsRes.value : { sessions: [] };
                const escStats = escalationsRes.status === 'fulfilled' ? escalationsRes.value : { stats: { pending: 0 } };
                setStats({
                    activeSessions: sessions.sessions?.filter((s: any) => s.status === 'ready').length || 0,
                    totalCustomers: 0,
                    pendingEscalations: escStats.stats?.pending || 0,
                    kbDocuments: 0,
                });
            } catch { /* API not available */ }
        };
        fetchStats();
    }, []);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page header */}
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
                <p className="text-sm text-muted-foreground mt-1">Overview of your WhatsApp automation system</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statCards.map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className="rounded-xl border border-border bg-card p-5 flex items-center gap-4 hover-lift">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted ${color}`}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold tracking-tight">{stats[key]}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* System status */}
            <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold">System Status</h3>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                        <Circle className="h-2 w-2 fill-current animate-pulse-dot" /> Online
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Service</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {services.map((svc) => (
                                <tr key={svc.name} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                                    <td className="px-5 py-3.5 flex items-center gap-2.5">
                                        <svc.icon className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{svc.name}</span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                                            <CheckCircle2 className="h-3 w-3" /> {svc.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-muted-foreground">{svc.detail}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
