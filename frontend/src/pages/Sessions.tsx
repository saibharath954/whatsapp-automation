import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import {
    Smartphone,
    Unplug,
    QrCode,
    CheckCircle2,
    Circle,
    AlertCircle,
    Loader2,
    WifiOff,
} from 'lucide-react';

interface SessionInfo {
    id: string;
    org_id: string;
    org_name?: string;
    phone_number: string | null;
    status: string;
    last_active_at: string | null;
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { icon: typeof Circle; label: string; cls: string }> = {
        ready: { icon: CheckCircle2, label: 'Ready', cls: 'bg-success/10 text-success' },
        qr_pending: { icon: QrCode, label: 'QR Pending', cls: 'bg-warning/10 text-warning' },
        authenticated: { icon: CheckCircle2, label: 'Authenticated', cls: 'bg-blue-500/10 text-blue-500' },
        initializing: { icon: Loader2, label: 'Initializing', cls: 'bg-blue-500/10 text-blue-500' },
        error: { icon: AlertCircle, label: 'Error', cls: 'bg-destructive/10 text-destructive' },
    };
    const entry = map[status] || { icon: WifiOff, label: 'Disconnected', cls: 'bg-muted text-muted-foreground' };
    const Icon = entry.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${entry.cls}`}>
            <Icon className="h-3 w-3" /> {entry.label}
        </span>
    );
}

export default function Sessions() {
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [wsStatus, setWsStatus] = useState('disconnected');
    const wsRef = useRef<WebSocket | null>(null);
    const orgId = '550e8400-e29b-41d4-a716-446655440001';

    useEffect(() => { fetchSessions(); }, []);

    const fetchSessions = async () => {
        try { const data = await api.get<{ sessions: SessionInfo[] }>('/api/admin/sessions'); setSessions(data.sessions || []); }
        catch { /* API not available */ }
    };

    const connectSession = () => {
        const ws = new WebSocket(`ws://${window.location.host}/ws/session/${orgId}`);
        wsRef.current = ws;
        ws.onopen = () => { setWsStatus('connecting'); ws.send(JSON.stringify({ type: 'connect' })); };
        ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'qr') { setQrCode(msg.data); setWsStatus('qr_pending'); }
            if (msg.type === 'status') { setWsStatus(msg.data); if (msg.data === 'ready') { setQrCode(null); fetchSessions(); } }
        };
        ws.onclose = () => setWsStatus('disconnected');
    };

    const disconnectSession = async () => {
        try { await api.delete(`/api/admin/sessions/${orgId}`); wsRef.current?.close(); setWsStatus('disconnected'); setQrCode(null); fetchSessions(); }
        catch { /* ignore */ }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">WhatsApp Sessions</h2>
                <p className="text-sm text-muted-foreground mt-1">Connect and manage WhatsApp sessions per organization</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button onClick={connectSession} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring press-effect">
                    <Smartphone className="h-4 w-4" /> Connect WhatsApp
                </button>
                <button onClick={disconnectSession} className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 focus:outline-none focus:ring-2 focus:ring-ring press-effect">
                    <Unplug className="h-4 w-4" /> Disconnect
                </button>
            </div>

            {/* QR Code */}
            {qrCode && (
                <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex flex-col items-center gap-4">
                        <h3 className="text-base font-semibold">Scan QR Code with WhatsApp</h3>
                        <div className="rounded-xl bg-white p-4 shadow-lg">
                            <img src={qrCode} alt="WhatsApp QR Code" className="h-64 w-64" />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            Status: <StatusBadge status={wsStatus} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Open WhatsApp &rarr; Menu &rarr; Linked Devices &rarr; Link a Device
                        </p>
                    </div>
                </div>
            )}

            {/* Connected banner */}
            {wsStatus === 'ready' && (
                <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-success">WhatsApp Connected</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Session is active. Incoming messages will be processed automatically.</p>
                    </div>
                </div>
            )}

            {/* Sessions table */}
            <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold">Active Sessions</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Organization</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Last Active</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.length === 0 ? (
                                <tr>
                                    <td colSpan={4}>
                                        <div className="flex flex-col items-center justify-center py-16 text-center">
                                            <Smartphone className="h-10 w-10 text-muted-foreground/40 mb-3" />
                                            <h3 className="text-sm font-semibold">No sessions yet</h3>
                                            <p className="text-xs text-muted-foreground mt-1">Click "Connect WhatsApp" to start a new session</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                sessions.map((s) => (
                                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                                        <td className="px-5 py-3.5 font-medium">{s.org_name || 'Demo Corp'}</td>
                                        <td className="px-5 py-3.5 text-muted-foreground">{s.phone_number || '—'}</td>
                                        <td className="px-5 py-3.5"><StatusBadge status={s.status} /></td>
                                        <td className="px-5 py-3.5 text-muted-foreground">{s.last_active_at ? new Date(s.last_active_at).toLocaleString() : '—'}</td>
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
