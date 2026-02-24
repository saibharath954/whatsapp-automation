import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../components/AuthProvider';
import {
    Search,
    Loader2,
    MessageSquare,
    Bot,
    User,
    UserCircle,
    Paperclip,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';

interface Conversation {
    customer_id: string;
    customer_phone: string;
    customer_name: string | null;
    status: string;
    last_message_text: string | null;
    last_message_time: string | null;
}

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
    const { orgId } = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch the list of all conversations on mount
    useEffect(() => {
        if (!orgId) return;
        const fetchConversations = async () => {
            setLoadingConversations(true);
            try {
                // We need to create this endpoint on the backend
                const data = await api.get<{ conversations: Conversation[] }>(`/api/conversations?orgId=${orgId}`);
                setConversations(data.conversations || []);
                if (data.conversations?.length > 0) {
                    setSelectedCustomer(data.conversations[0].customer_id);
                }
            } catch {
                setError('Failed to load conversation list');
            } finally {
                setLoadingConversations(false);
            }
        };
        fetchConversations();
    }, [orgId]);

    // Fetch message history when a customer is selected
    useEffect(() => {
        if (!selectedCustomer || !orgId) return;
        const fetchHistory = async () => {
            setLoadingMessages(true);
            try {
                const data = await api.get<{ messages: ChatMessage[] }>(`/api/conversations/${selectedCustomer}/history?orgId=${orgId}`);
                setMessages(data.messages || []);
            } catch {
                setError('Failed to load message history');
            } finally {
                setLoadingMessages(false);
            }
        };
        fetchHistory();
    }, [selectedCustomer, orgId]);

    const filteredConversations = conversations.filter(c =>
        (c.customer_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        c.customer_phone.includes(searchQuery)
    );

    const senderInfo = (role: string) => {
        switch (role) {
            case 'bot': return { icon: Bot, label: 'AI Agent' };
            case 'agent': return { icon: User, label: 'Human Agent' };
            default: return { icon: UserCircle, label: 'Customer' };
        }
    };

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6 animate-fade-in">

            {/* Left Pane: Conversation List */}
            <div className="w-1/3 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30">
                    <h2 className="text-lg font-semibold tracking-tight mb-4">Chats</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                        <input
                            type="text"
                            placeholder="Search name or number..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm transition-colors placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loadingConversations ? (
                        <div className="flex items-center justify-center h-32">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredConversations.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No conversations found.
                        </div>
                    ) : (
                        filteredConversations.map((conv) => {
                            const isSelected = selectedCustomer === conv.customer_id;
                            return (
                                <button
                                    key={conv.customer_id}
                                    onClick={() => setSelectedCustomer(conv.customer_id)}
                                    className={`w-full text-left p-4 border-b border-border/50 transition-colors flex items-start gap-3
                                        ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted/50 border-l-4 border-l-transparent'}`}
                                >
                                    <div className="h-10 w-10 shrink-0 rounded-full bg-muted flex items-center justify-center">
                                        <UserCircle className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <h3 className="text-sm font-semibold truncate">{conv.customer_name || conv.customer_phone}</h3>
                                            {conv.last_message_time && (
                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                                                    {new Date(conv.last_message_time).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {conv.last_message_text || 'No messages yet'}
                                        </p>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right Pane: Chat History */}
            <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
                {error && (
                    <div className="m-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                    </div>
                )}

                {!selectedCustomer ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/10">
                        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <h3 className="text-lg font-semibold">WA Automation</h3>
                        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                            Select a conversation from the sidebar to view the full message history and AI routing details.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-background border border-border flex items-center justify-center">
                                    <UserCircle className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold">
                                        {conversations.find(c => c.customer_id === selectedCustomer)?.customer_name ||
                                            conversations.find(c => c.customer_id === selectedCustomer)?.customer_phone}
                                    </h3>
                                    <span className="text-xs flex items-center gap-1 text-success">
                                        <CheckCircle2 className="h-3 w-3" /> Managed by AI
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.05\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")' }}>
                            {loadingMessages ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                                    No messages in this conversation.
                                </div>
                            ) : (
                                messages.map((msg) => {
                                    const { icon: SenderIcon, label } = senderInfo(msg.sender_role);
                                    const isOutbound = msg.direction === 'outbound';
                                    return (
                                        <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
                                                ${isOutbound
                                                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                                                    : 'bg-background border border-border rounded-bl-sm'
                                                }`}>
                                                <p className="whitespace-pre-wrap">{msg.text}</p>

                                                <div className={`flex items-center justify-end gap-1.5 mt-2 text-[10px] font-medium
                                                    ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                                    <SenderIcon className="h-3 w-3" />
                                                    <span>{label}</span>
                                                    <span>&middot;</span>
                                                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                                                    {msg.llm_confidence != null && (
                                                        <>
                                                            <span>&middot;</span>
                                                            <span title="AI Confidence Score">
                                                                {(msg.llm_confidence * 100).toFixed(0)}%
                                                            </span>
                                                        </>
                                                    )}
                                                    {msg.linked_doc_ids && msg.linked_doc_ids.length > 0 && (
                                                        <>
                                                            <span title="Sourced from KB">
                                                                <Paperclip className="h-3 w-3" />
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}