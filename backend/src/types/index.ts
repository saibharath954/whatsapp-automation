// ─── Core Domain Types ───

export interface Org {
    id: string;
    name: string;
    slug: string;
    settings: OrgSettings;
    created_at: string;
    updated_at: string;
}

export interface OrgSettings {
    business_hours: BusinessHours;
    fallback_message: string;
    escalation_message: string;
    max_context_messages: number;
    max_context_days: number;
    rag_top_k: number;
    similarity_threshold: number;
    confidence_threshold: number;
    rate_limit_per_minute: number;
}

export interface BusinessHours {
    enabled: boolean;
    timezone: string;
    schedule: Record<string, { start: string; end: string } | null>; // e.g. { "monday": { start: "09:00", end: "18:00" } }
}

export interface WhatsAppSession {
    id: string;
    org_id: string;
    phone_number: string | null;
    status: SessionStatus;
    auth_state_encrypted: string | null;
    last_active_at: string | null;
    created_at: string;
    updated_at: string;
}

export type SessionStatus = 'initializing' | 'qr_pending' | 'authenticated' | 'ready' | 'disconnected' | 'error';

export interface Customer {
    id: string;
    org_id: string;
    phone_number: string;
    name: string | null;
    first_seen_at: string;
    order_count: number;
    tags: string[];
    last_order_summary: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface Conversation {
    id: string;
    org_id: string;
    customer_id: string;
    session_id: string;
    status: ConversationStatus;
    created_at: string;
    updated_at: string;
}

export type ConversationStatus = 'active' | 'escalated' | 'resolved' | 'archived';

export interface Message {
    id: string;
    conversation_id: string;
    org_id: string;
    timestamp: string; // ISO8601
    direction: 'inbound' | 'outbound';
    sender_role: 'customer' | 'agent' | 'bot';
    text: string;
    media_meta: MediaMeta | null;
    linked_doc_ids: string[];
    llm_confidence: number | null;
    created_at: string;
}

export interface MediaMeta {
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
    mime_type: string;
    filename: string | null;
    size_bytes: number | null;
    storage_path: string;
    ocr_text: string | null;
}

export interface KBDocument {
    id: string;
    org_id: string;
    title: string;
    source_url: string | null;
    file_type: 'pdf' | 'html' | 'csv' | 'text';
    status: 'processing' | 'ready' | 'error';
    chunk_count: number;
    created_at: string;
    updated_at: string;
}

export interface KBChunk {
    id: string;
    document_id: string;
    org_id: string;
    chunk_index: number;
    chunk_text: string;
    embedding: number[] | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface Automation {
    id: string;
    org_id: string;
    scope: AutomationScope;
    enabled: boolean;
    fallback_message: string;
    escalation_rules: EscalationRule[];
    created_at: string;
    updated_at: string;
}

export type AutomationScope = 'all' | 'repeat' | 'custom';

export interface EscalationRule {
    type: 'low_confidence' | 'keyword' | 'sentiment' | 'no_retrieval';
    threshold?: number;
    keywords?: string[];
    action: 'escalate' | 'fallback' | 'transfer';
}

export interface Escalation {
    id: string;
    org_id: string;
    conversation_id: string;
    customer_id: string;
    reason: string;
    status: EscalationStatus;
    assigned_to: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
}

export type EscalationStatus = 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'dismissed';

// ─── Context Assembly Types ───

export interface ChatContext {
    conversation_history: ContextMessage[];
    customer_profile: CustomerProfile;
    session_metadata: SessionMetadata;
    automation_config: AutomationConfig;
    retrieval_results: RetrievalResult[];
    previous_bot_answers: BotAnswer[];
}

export interface ContextMessage {
    id: string;
    timestamp: string; // ISO8601
    direction: 'inbound' | 'outbound';
    sender_role: 'customer' | 'agent' | 'bot';
    text: string;
    media_meta: MediaMeta | null;
    linked_doc_ids: string[];
}

export interface CustomerProfile {
    customer_id: string;
    phone_number: string;
    name: string | null;
    first_seen_at: string;
    order_count: number;
    tags: string[];
    last_order_summary: string | null;
}

export interface SessionMetadata {
    session_id: string;
    org_id: string;
    whatsapp_phone: string | null;
    session_status: SessionStatus;
    business_hours_flag: boolean;
}

export interface AutomationConfig {
    scope: AutomationScope;
    fallback_message: string;
    escalation_rules: EscalationRule[];
}

export interface RetrievalResult {
    doc_id: string;
    title: string;
    source_url: string | null;
    chunk_text: string;
    chunk_score: number;
}

export interface BotAnswer {
    message_id: string;
    text: string;
    confidence: number | null;
    customer_confirmed: boolean;
    timestamp: string;
}

// ─── LLM Types ───

export interface LLMRequest {
    system_prompt: string;
    messages: LLMMessage[];
    temperature?: number;
    max_tokens?: number;
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMResponse {
    content: string;
    confidence: number;
    citations: string[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    raw_response?: unknown;
}

// ─── Vector DB Types ───

export interface VectorDocument {
    id: string;
    embedding: number[];
    metadata: Record<string, string | number>;
    text: string;
}

export interface VectorSearchResult {
    id: string;
    score: number;
    text: string;
    metadata: Record<string, string | number>;
}

// ─── WhatsApp Transport Interface ───
// This interface allows swapping whatsapp-web.js for Cloud API

export interface WhatsAppTransport {
    initialize(orgId: string): Promise<void>;
    sendMessage(to: string, text: string): Promise<void>;
    onMessage(handler: (msg: InboundWhatsAppMessage) => Promise<void>): void;
    onQR(handler: (qr: string) => void): void;
    onReady(handler: () => void): void;
    onDisconnected(handler: (reason: string) => void): void;
    getStatus(): SessionStatus;
    disconnect(): Promise<void>;
}

export interface InboundWhatsAppMessage {
    id: string;
    from: string;
    body: string;
    timestamp: number;
    hasMedia: boolean;
    mediaType?: string;
    mediaData?: Buffer;
    mediaFilename?: string;
    mediaMimeType?: string;
}
