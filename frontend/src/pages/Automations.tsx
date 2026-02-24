import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import {
    Globe,
    RefreshCw,
    Target,
    Save,
    Loader2,
    CheckCircle2,
    ShieldAlert,
    AlertCircle,
} from 'lucide-react';

interface AutomationConfig {
    id: string;
    scope: string;
    enabled: boolean;
    fallback_message: string;
    escalation_rules: any[];
}

const scopes = [
    { value: 'all', label: 'All Messages', icon: Globe, desc: 'Respond to every incoming message' },
    { value: 'repeat', label: 'Repeat Customers Only', icon: RefreshCw, desc: 'Only respond to known customers' },
    { value: 'custom', label: 'Custom Rules', icon: Target, desc: 'Apply custom filter rules' },
] as const;

export default function Automations() {
    const { orgId } = useAuth();
    const [_config, setConfig] = useState<AutomationConfig | null>(null);
    const [scope, setScope] = useState('all');
    const [fallback, setFallback] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!orgId) return;
        const fetchConfig = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.get<{ automation: AutomationConfig }>(`/api/automations/${orgId}`);
                setConfig(res.automation);
                setScope(res.automation.scope);
                setFallback(res.automation.fallback_message);
            } catch (err: any) {
                // Ignore 404s, it just means they need to create their first config.
                if (err.response?.status === 404 || err.status === 404) {
                    // Do not set an error. Leave the default scope/fallback in place.
                    return;
                }
                setError('Failed to load automation config. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, [orgId]);

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        if (!orgId) return;
        setSaving(true);
        setError(null);
        try {
            await api.put(`/api/automations/${orgId}`, { scope, fallback_message: fallback });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch {
            setError('Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Automation Config</h2>
                <p className="text-sm text-muted-foreground mt-1">Configure automation scope, fallback messages, and escalation rules</p>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
                {/* Scope */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border px-5 py-4">
                        <h3 className="text-sm font-semibold">Automation Scope</h3>
                    </div>
                    <div className="p-5">
                        <p className="text-sm text-muted-foreground mb-4">Choose which messages the bot should automatically respond to.</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {scopes.map((s) => {
                                const Icon = s.icon;
                                const active = scope === s.value;
                                return (
                                    <button key={s.value} type="button" onClick={() => setScope(s.value)}
                                        className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all
                      ${active ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'}`}>
                                        <Icon className={`h-5 w-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className="text-sm font-medium">{s.label}</span>
                                        <span className="text-xs text-muted-foreground">{s.desc}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Fallback */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border px-5 py-4">
                        <h3 className="text-sm font-semibold">Fallback Message</h3>
                    </div>
                    <div className="p-5">
                        <p className="text-sm text-muted-foreground mb-3">Sent when the bot can't answer confidently from the knowledge base.</p>
                        <textarea value={fallback} onChange={(e) => setFallback(e.target.value)} rows={3}
                            placeholder="I don't know based on our documents. Would you like to connect to a human?"
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
                    </div>
                </div>

                {/* Anti-hallucination */}
                <div className="rounded-xl border border-border bg-card">
                    <div className="border-b border-border px-5 py-4 flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">Anti-Hallucination Settings</h3>
                    </div>
                    <div className="p-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Similarity Threshold</label>
                            <input type="number" step="0.05" min="0" max="1" defaultValue="0.20"
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring" />
                            <p className="text-xs text-muted-foreground mt-1.5">KB retrieval must exceed this score (default: 0.20)</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">LLM Confidence Threshold</label>
                            <input type="number" step="0.05" min="0" max="1" defaultValue="0.70"
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring" />
                            <p className="text-xs text-muted-foreground mt-1.5">Below this, escalation is triggered (default: 0.70)</p>
                        </div>
                    </div>
                </div>

                {/* Save */}
                <div className="flex items-center gap-3">
                    <button type="submit" disabled={saving || !orgId}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 press-effect">
                        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save Configuration</>}
                    </button>
                    {saved && (
                        <span className="inline-flex items-center gap-1.5 text-sm text-success">
                            <CheckCircle2 className="h-4 w-4" /> Saved successfully
                        </span>
                    )}
                </div>
            </form>
        </div>
    );
}
