import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import {
    Clock,
    MessageSquare,
    CheckCircle2,
    Circle,
    Loader2,
    UserCheck,
    PartyPopper,
    AlertCircle,
} from 'lucide-react';

interface EscalationItem {
    id: string;
    conversation_id: string;
    customer_id: string;
    customer_phone?: string;
    customer_name?: string;
    reason: string;
    status: string;
    assigned_to: string | null;
    created_at: string;
}

function EscStatusBadge({ status }: { status: string }) {
    const map: Record<string, { icon: typeof Circle; label: string; cls: string }> = {
        pending: { icon: Clock, label: 'Pending', cls: 'bg-warning/10 text-warning' },
        in_progress: { icon: Loader2, label: 'In Progress', cls: 'bg-blue-500/10 text-blue-500' },
        assigned: { icon: UserCheck, label: 'Assigned', cls: 'bg-blue-500/10 text-blue-500' },
        resolved: { icon: CheckCircle2, label: 'Resolved', cls: 'bg-success/10 text-success' },
    };
    const entry = map[status] || { icon: Circle, label: status, cls: 'bg-muted text-muted-foreground' };
    const Icon = entry.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${entry.cls}`}>
            <Icon className="h-3 w-3" /> {entry.label}
        </span>
    );
}

export default function Escalations() {
    const { orgId, user } = useAuth();
    const [escalations, setEscalations] = useState<EscalationItem[]>([]);
    const [stats, setStats] = useState({ pending: 0, in_progress: 0, resolved_today: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (orgId) {
            fetchEscalations();
            fetchStats();
        }
    }, [orgId]);

    const fetchEscalations = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get<{ escalations: EscalationItem[] }>(`/api/escalations?orgId=${orgId}`);
            setEscalations(data.escalations || []);
        } catch {
            setError('Failed to load escalations. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const data = await api.get<{ stats: any }>(`/api/escalations/stats?orgId=${orgId}`);
            setStats(data.stats || { pending: 0, in_progress: 0, resolved_today: 0 });
        } catch { /* stats error is non-critical */ }
    };

    const handleTakeover = async (id: string) => {
        try {
            await api.post(`/api/escalations/${id}/takeover`, { operatorName: user?.name || 'Operator' });
            fetchEscalations();
            fetchStats();
        } catch {
            setError('Failed to take over escalation');
        }
    };

    const handleResolve = async (id: string) => {
        try {
            await api.post(`/api/escalations/${id}/resolve`);
            fetchEscalations();
            fetchStats();
        } catch {
            setError('Failed to resolve escalation');
        }
    };

    const statCards = [
        { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-warning' },
        { label: 'In Progress', value: stats.in_progress, icon: MessageSquare, color: 'text-blue-500' },
        { label: 'Resolved Today', value: stats.resolved_today, icon: CheckCircle2, color: 'text-success' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Escalations</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage customer escalations and operator takeovers</p>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {statCards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl border border-border bg-card p-5 flex items-center gap-4 hover-lift">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted ${color}`}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <div>
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-1" />
                            ) : (
                                <p className="text-2xl font-bold tracking-tight">{value}</p>
                            )}
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Queue */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold">Escalation Queue</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned To</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="flex flex-col items-center justify-center py-16 text-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                                            <p className="text-sm text-muted-foreground">Loading escalations...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : escalations.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="flex flex-col items-center justify-center py-16 text-center">
                                            <PartyPopper className="h-10 w-10 text-muted-foreground/40 mb-3" />
                                            <h3 className="text-sm font-semibold">No pending escalations</h3>
                                            <p className="text-xs text-muted-foreground mt-1">All customer queries are being handled by the bot</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                escalations.map((e) => (
                                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <span className="font-medium">{e.customer_name || 'Unknown'}</span>
                                            {e.customer_phone && <p className="text-xs text-muted-foreground mt-0.5">{e.customer_phone}</p>}
                                        </td>
                                        <td className="px-5 py-3.5 max-w-[250px] text-muted-foreground text-xs">{e.reason}</td>
                                        <td className="px-5 py-3.5"><EscStatusBadge status={e.status} /></td>
                                        <td className="px-5 py-3.5 text-muted-foreground">{e.assigned_to || '—'}</td>
                                        <td className="px-5 py-3.5 text-muted-foreground text-xs">{new Date(e.created_at).toLocaleString()}</td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex gap-2">
                                                {e.status === 'pending' && (
                                                    <button onClick={() => handleTakeover(e.id)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring">
                                                        Take Over
                                                    </button>
                                                )}
                                                {(e.status === 'in_progress' || e.status === 'assigned') && (
                                                    <button onClick={() => handleResolve(e.id)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring">
                                                        <CheckCircle2 className="h-3 w-3" /> Resolve
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}