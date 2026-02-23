import {
    ChatContext,
    ContextMessage,
    CustomerProfile,
    SessionMetadata,
    AutomationConfig,
    RetrievalResult,
    BotAnswer,
    Message,
    Customer,
    WhatsAppSession,
    Automation,
    OrgSettings,
} from '../../types';
import { query } from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Context Assembler: builds the complete ChatContext required for every LLM call.
 *
 * Includes:
 *  - Conversation history (last N messages or last M days, whichever is shorter)
 *  - Customer profile
 *  - Session metadata
 *  - Automation config
 *  - Retrieval results (injected externally)
 *  - Previous bot answers with confirmation status
 */
export class ContextAssembler {
    /**
     * Assemble full context for an incoming customer message.
     */
    async assemble(params: {
        conversationId: string;
        customerId: string;
        orgId: string;
        sessionId: string;
        retrievalResults: RetrievalResult[];
        orgSettings: OrgSettings;
    }): Promise<ChatContext> {
        const startTime = Date.now();

        const [
            conversationHistory,
            customerProfile,
            sessionMetadata,
            automationConfig,
            previousBotAnswers,
        ] = await Promise.all([
            this.getConversationHistory(
                params.conversationId,
                params.orgSettings.max_context_messages || config.contextMaxMessages,
                params.orgSettings.max_context_days || config.contextMaxDays
            ),
            this.getCustomerProfile(params.customerId),
            this.getSessionMetadata(params.sessionId, params.orgId, params.orgSettings),
            this.getAutomationConfig(params.orgId),
            this.getPreviousBotAnswers(params.conversationId),
        ]);

        const latency = Date.now() - startTime;
        logger.info({
            orgId: params.orgId,
            conversationId: params.conversationId,
            historyCount: conversationHistory.length,
            retrievalCount: params.retrievalResults.length,
            botAnswerCount: previousBotAnswers.length,
            latency,
        }, 'Context assembled');

        return {
            conversation_history: conversationHistory,
            customer_profile: customerProfile,
            session_metadata: sessionMetadata,
            automation_config: automationConfig,
            retrieval_results: params.retrievalResults,
            previous_bot_answers: previousBotAnswers,
        };
    }

    /**
     * Get conversation history: last N messages OR messages within last M days, whichever is shorter.
     */
    private async getConversationHistory(
        conversationId: string,
        maxMessages: number,
        maxDays: number,
    ): Promise<ContextMessage[]> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxDays);

        const messages = await query<Message>(
            `SELECT id, timestamp, direction, sender_role, text, media_meta, linked_doc_ids
       FROM messages
       WHERE conversation_id = $1 AND timestamp >= $2
       ORDER BY timestamp DESC
       LIMIT $3`,
            [conversationId, cutoffDate.toISOString(), maxMessages]
        );

        // Return in chronological order
        return messages.reverse().map((m) => ({
            id: m.id,
            timestamp: new Date(m.timestamp).toISOString(),
            direction: m.direction,
            sender_role: m.sender_role,
            text: m.text,
            media_meta: m.media_meta,
            linked_doc_ids: m.linked_doc_ids || [],
        }));
    }

    /**
     * Get customer profile.
     */
    private async getCustomerProfile(customerId: string): Promise<CustomerProfile> {
        const customer = await query<Customer>(
            `SELECT id, phone_number, name, first_seen_at, order_count, tags, last_order_summary
       FROM customers WHERE id = $1`,
            [customerId]
        );

        if (!customer[0]) {
            return {
                customer_id: customerId,
                phone_number: 'unknown',
                name: null,
                first_seen_at: new Date().toISOString(),
                order_count: 0,
                tags: [],
                last_order_summary: null,
            };
        }

        const c = customer[0];
        return {
            customer_id: c.id,
            phone_number: c.phone_number,
            name: c.name,
            first_seen_at: new Date(c.first_seen_at).toISOString(),
            order_count: c.order_count,
            tags: c.tags || [],
            last_order_summary: c.last_order_summary,
        };
    }

    /**
     * Get session metadata with business hours flag.
     */
    private async getSessionMetadata(
        sessionId: string,
        orgId: string,
        orgSettings: OrgSettings,
    ): Promise<SessionMetadata> {
        const session = await query<WhatsAppSession>(
            `SELECT id, org_id, phone_number, status FROM whatsapp_sessions WHERE id = $1`,
            [sessionId]
        );

        const businessHoursFlag = this.isWithinBusinessHours(orgSettings);

        if (!session[0]) {
            return {
                session_id: sessionId,
                org_id: orgId,
                whatsapp_phone: null,
                session_status: 'disconnected',
                business_hours_flag: businessHoursFlag,
            };
        }

        return {
            session_id: session[0].id,
            org_id: session[0].org_id,
            whatsapp_phone: session[0].phone_number,
            session_status: session[0].status,
            business_hours_flag: businessHoursFlag,
        };
    }

    /**
     * Get automation config for org.
     */
    private async getAutomationConfig(orgId: string): Promise<AutomationConfig> {
        const automation = await query<Automation>(
            `SELECT scope, fallback_message, escalation_rules FROM automations WHERE org_id = $1`,
            [orgId]
        );

        if (!automation[0]) {
            return {
                scope: 'all',
                fallback_message: config.nodeEnv === 'test'
                    ? 'I don\'t know based on our documents. Would you like to connect to a human?'
                    : 'I don\'t have enough information to answer that accurately. Would you like to speak with a human agent?',
                escalation_rules: [],
            };
        }

        return {
            scope: automation[0].scope,
            fallback_message: automation[0].fallback_message,
            escalation_rules: automation[0].escalation_rules as unknown as AutomationConfig['escalation_rules'],
        };
    }

    /**
     * Get previous bot answers with confirmation status.
     */
    private async getPreviousBotAnswers(conversationId: string): Promise<BotAnswer[]> {
        const botMessages = await query<Message>(
            `SELECT id, text, llm_confidence, timestamp
       FROM messages
       WHERE conversation_id = $1 AND sender_role = 'bot'
       ORDER BY timestamp DESC
       LIMIT 10`,
            [conversationId]
        );

        return botMessages.map((m) => ({
            message_id: m.id,
            text: m.text,
            confidence: m.llm_confidence,
            customer_confirmed: false, // TODO: track confirmation from subsequent customer messages
            timestamp: new Date(m.timestamp).toISOString(),
        }));
    }

    /**
     * Check if current time falls within org's business hours.
     */
    private isWithinBusinessHours(settings: OrgSettings): boolean {
        if (!settings.business_hours?.enabled) return true;

        const now = new Date();
        const tz = settings.business_hours.timezone || 'UTC';

        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                weekday: 'long',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
            const parts = formatter.formatToParts(now);
            const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase();
            const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
            const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

            if (!weekday) return true;

            const schedule = settings.business_hours.schedule[weekday];
            if (!schedule) return false; // Day not in schedule

            const [startH, startM] = schedule.start.split(':').map(Number);
            const [endH, endM] = schedule.end.split(':').map(Number);

            const currentMinutes = hour * 60 + minute;
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;

            return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        } catch {
            return true; // Default to within business hours on error
        }
    }
}
