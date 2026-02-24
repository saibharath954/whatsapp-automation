import { useState } from 'react';
import { api } from '../lib/api';
import {
    Search,
    Loader2,
    MessageSquare,
    Bot,
    User,
    UserCircle,
    Paperclip,
} from 'lucide-react';

interface ChatMessage {
    id: string;
    direction: 'inbound' | 'outbound';
    sender_role: string;
    text: string;
    timestamp: string;
    llm_confidence?: number;
    linked_doc_ids?: string[];
}

export default function ChatView() {
    const [customerId, setCustomerId] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const orgId = '550e8400-e29b-41d4-a716-446655440001';

    const fetchHistory = async () => {
        if (!customerId) return;
        setLoading(true);
        try { const data = await api.get<{ messages: ChatMessage[] }>(`/api/conversations/${customerId}/history?orgId=${orgId}`); setMessages(data.messages || []); }
        catch { /* ignore */ } finally { setLoading(false); }
    };

    const senderInfo = (role: string) => {
        switch (role) {
            case 'bot': return { icon: Bot, label: 'Bot' };
            case 'agent': return { icon: User, label: 'Agent' };
            default: return { icon: UserCircle, label: 'Customer' };
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Chat View</h2>
                <p className="text-sm text-muted-foreground mt-1">View conversation history and live chat</p>
            </div>

            {/* Lookup */}
            <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Customer ID</label>
                        <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Enter customer UUID"
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <button onClick={fetchHistory} disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 press-effect">
                        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</> : <><Search className="h-4 w-4" /> Load History</>}
                    </button>
                </div>
            </div>

            {/* Chat */}
            <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <h3 className="text-sm font-semibold">Conversation</h3>
                    {messages.length > 0 && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{messages.length} messages</span>
                    )}
                </div>

                <div className="overflow-y-auto p-5 space-y-3" style={{ height: 'calc(100vh - 380px)' }}>
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
                            <h3 className="text-sm font-semibold">No messages</h3>
                            <p className="text-xs text-muted-foreground mt-1">Enter a customer ID and click "Load History" to view their conversation</p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const { icon: SenderIcon, label } = senderInfo(msg.sender_role);
                            const isOutbound = msg.direction === 'outbound';
                            return (
                                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[70%] rounded-xl px-4 py-3 text-sm leading-relaxed
                    ${isOutbound
                                            ? 'bg-primary text-primary-foreground'
                                            : 'border border-border bg-muted'
                                        }`}>
                                        <p>{msg.text}</p>
                                        <div className={`flex items-center gap-1.5 mt-2 text-[11px]
                      ${isOutbound ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                            <SenderIcon className="h-3 w-3" />
                                            <span>{label}</span>
                                            <span>&middot;</span>
                                            <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                            {msg.llm_confidence != null && (
                                                <><span>&middot;</span><span>Confidence: {(msg.llm_confidence * 100).toFixed(0)}%</span></>
                                            )}
                                            {msg.linked_doc_ids && msg.linked_doc_ids.length > 0 && (
                                                <><span>&middot;</span><Paperclip className="h-3 w-3" /><span>{msg.linked_doc_ids.length} source(s)</span></>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
