import { v4 as uuid } from 'uuid';
import {
    InboundWhatsAppMessage,
    Org,
    OrgSettings,
    Message,
    RetrievalResult,
} from '../../types';
import { query, queryOne } from '../../db';
import { ContextAssembler } from '../context';
import { TokenBudgetManager } from '../context/token-budget';
import { RetrievalService } from '../rag/retrieval.service';
import { LLMProvider, buildSystemPrompt, buildUserPrompt } from '../llm';
import { EscalationService } from '../escalation';
import { SessionManager } from './session-manager';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Message Pipeline: the core handler for every inbound WhatsApp message.
 *
 * For each incoming message:
 *  1. Resolve/create customer and conversation
 *  2. Save inbound message to DB
 *  3. Assemble full context (conversation history, customer profile, session, etc.)
 *  4. Run RAG retrieval over org's KB
 *  5. Build prompt with anti-hallucination system prompt
 *  6. Call LLM — ALWAYS, even if no KB docs were found (handles greetings, chitchat)
 *  7. Check LLM confidence → reply or escalate
 *  8. Save bot reply to DB
 *
 * IMPORTANT: The pipeline binds itself to the SessionManager's globalMessageHandler
 * in the constructor, guaranteeing all sessions route messages through this pipeline
 * without needing explicit per-org registration.
 */
export class MessagePipeline {
    constructor(
        private sessionManager: SessionManager,
        private contextAssembler: ContextAssembler,
        private tokenBudgetManager: TokenBudgetManager,
        private retrievalService: RetrievalService,
        private llmProvider: LLMProvider,
        private escalationService: EscalationService,
    ) {
        // Bind this pipeline as the global message handler for ALL sessions.
        // This eliminates the race condition where messages arrive before
        // a per-org handler is registered.
        this.sessionManager.setGlobalMessageHandler(
            (orgId, msg) => this.handleInboundMessage(orgId, msg)
        );
    }

    /**
     * Main message processing pipeline.
     */
    async handleInboundMessage(orgId: string, msg: InboundWhatsAppMessage): Promise<void> {
        const startTime = Date.now();
        const log = logger.child({ orgId, from: msg.from, messageId: msg.id });

        try {
            // 1. Get org settings
            const org = await queryOne<Org>(
                `SELECT * FROM orgs WHERE id = $1`,
                [orgId]
            );
            if (!org) {
                log.error('Org not found');
                return;
            }
            const settings = org.settings as unknown as OrgSettings;

            // 2. Get or create customer
            const customer = await this.getOrCreateCustomer(orgId, msg.from);

            // 3. Get or create conversation
            const conversation = await this.getOrCreateConversation(orgId, customer.id);

            // Check if conversation is escalated (operator has taken over)
            if (conversation.status === 'escalated') {
                log.info('Conversation is escalated, skipping bot response');
                await this.saveMessage(conversation.id, orgId, msg, 'inbound', 'customer');
                return;
            }

            // 4. Save inbound message
            await this.saveMessage(conversation.id, orgId, msg, 'inbound', 'customer');

            // 5. Run RAG retrieval
            const { results: retrievalResults, aggregateConfidence } =
                await this.retrievalService.retrieve(
                    orgId,
                    msg.body,
                    settings.rag_top_k || config.ragTopK,
                    settings.similarity_threshold || config.ragSimilarityThreshold,
                );

            // 6. Assemble full context
            let context = await this.contextAssembler.assemble({
                conversationId: conversation.id,
                customerId: customer.id,
                orgId,
                sessionId: conversation.session_id || '',
                retrievalResults,
                orgSettings: settings,
            });

            // 7. Apply token budget
            context = this.tokenBudgetManager.trimContext(context);

            // 8. Build prompts and call LLM — ALWAYS
            // We no longer short-circuit on low RAG confidence. The LLM can handle
            // greetings ("Hi there!"), chitchat, and general queries without KB docs.
            // The system prompt instructs it to only cite KB when available.
            const systemPrompt = buildSystemPrompt(org.name);
            const userPrompt = buildUserPrompt(msg.body, context);

            log.info(
                { aggregateConfidence, retrievalCount: retrievalResults.length },
                'Calling LLM'
            );

            const llmResponse = await this.llmProvider.chat({
                system_prompt: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                temperature: 0.2,
                max_tokens: 2048,
            });

            // 9. Check LLM confidence — this is the ONLY escalation gate
            const confidenceThreshold = settings.confidence_threshold || config.llmConfidenceThreshold;

            if (llmResponse.confidence < confidenceThreshold) {
                log.info({ confidence: llmResponse.confidence }, 'Low LLM confidence, escalating');
                await this.handleLowConfidence(
                    orgId,
                    conversation.id,
                    customer.id,
                    msg.from,
                    settings.fallback_message || 'I don\'t know based on our documents. Would you like to connect to a human?',
                    `LLM confidence too low: ${llmResponse.confidence}`
                );
                return;
            }

            // 10. Extract linked doc IDs from citations
            const linkedDocIds = this.extractLinkedDocIds(llmResponse.citations, retrievalResults);

            // 11. Save bot reply to DB
            await this.saveBotMessage(
                conversation.id,
                orgId,
                llmResponse.content,
                llmResponse.confidence,
                linkedDocIds,
            );

            // 12. Send reply via WhatsApp
            const transport = this.sessionManager.getTransport(orgId);
            if (transport) {
                await transport.sendMessage(msg.from, llmResponse.content);
            }

            const totalLatency = Date.now() - startTime;
            log.info({
                totalLatency,
                confidence: llmResponse.confidence,
                citations: llmResponse.citations,
                tokensUsed: llmResponse.usage.total_tokens,
            }, 'Message pipeline completed');

        } catch (error) {
            log.error({ error }, 'Message pipeline error');
        }
    }

    /**
     * Handle low confidence: send fallback and create escalation.
     */
    private async handleLowConfidence(
        orgId: string,
        conversationId: string,
        customerId: string,
        fromPhone: string,
        fallbackMessage: string,
        reason: string,
    ): Promise<void> {
        // Save fallback as bot message
        await this.saveBotMessage(conversationId, orgId, fallbackMessage, 0.1, []);

        // Send fallback via WhatsApp
        const transport = this.sessionManager.getTransport(orgId);
        if (transport) {
            await transport.sendMessage(fromPhone, fallbackMessage);
        }

        // Create escalation
        await this.escalationService.createEscalation({
            orgId,
            conversationId,
            customerId,
            reason,
        });
    }

    /**
     * Get or create a customer record.
     */
    private async getOrCreateCustomer(orgId: string, phone: string) {
        // Normalize phone (remove @c.us suffix from whatsapp-web.js)
        const normalizedPhone = phone.replace('@c.us', '').replace('@s.whatsapp.net', '');

        let customer = await queryOne<{ id: string; status?: string }>(
            `SELECT id FROM customers WHERE org_id = $1 AND phone_number = $2`,
            [orgId, normalizedPhone]
        );

        if (!customer) {
            const rows = await query<{ id: string }>(
                `INSERT INTO customers (org_id, phone_number) VALUES ($1, $2) RETURNING id`,
                [orgId, normalizedPhone]
            );
            customer = rows[0];
        }

        return { id: customer.id };
    }

    /**
     * Get or create an active conversation.
     */
    private async getOrCreateConversation(orgId: string, customerId: string) {
        // Look for existing active conversation
        let conv = await queryOne<{ id: string; status: string; session_id: string }>(
            `SELECT id, status, session_id FROM conversations
       WHERE org_id = $1 AND customer_id = $2 AND status IN ('active', 'escalated')
       ORDER BY updated_at DESC LIMIT 1`,
            [orgId, customerId]
        );

        if (!conv) {
            // Get org's session
            const session = await queryOne<{ id: string }>(
                `SELECT id FROM whatsapp_sessions WHERE org_id = $1`,
                [orgId]
            );

            const rows = await query<{ id: string; status: string; session_id: string }>(
                `INSERT INTO conversations (org_id, customer_id, session_id, status)
         VALUES ($1, $2, $3, 'active') RETURNING id, status, session_id`,
                [orgId, customerId, session?.id || null]
            );
            conv = rows[0];
        }

        return conv;
    }

    /**
     * Save an inbound or outbound message to DB.
     */
    private async saveMessage(
        conversationId: string,
        orgId: string,
        msg: InboundWhatsAppMessage,
        direction: 'inbound' | 'outbound',
        senderRole: 'customer' | 'agent' | 'bot',
    ): Promise<void> {
        await query(
            `INSERT INTO messages (conversation_id, org_id, timestamp, direction, sender_role, text, media_meta)
       VALUES ($1, $2, to_timestamp($3), $4, $5, $6, $7)`,
            [
                conversationId,
                orgId,
                msg.timestamp,
                direction,
                senderRole,
                msg.body,
                msg.hasMedia ? JSON.stringify({
                    type: msg.mediaType,
                    mime_type: msg.mediaMimeType,
                    filename: msg.mediaFilename,
                }) : null,
            ]
        );
    }

    /**
     * Save a bot reply to DB.
     */
    private async saveBotMessage(
        conversationId: string,
        orgId: string,
        text: string,
        confidence: number,
        linkedDocIds: string[],
    ): Promise<void> {
        await query(
            `INSERT INTO messages (conversation_id, org_id, timestamp, direction, sender_role, text, llm_confidence, linked_doc_ids)
       VALUES ($1, $2, NOW(), 'outbound', 'bot', $3, $4, $5)`,
            [conversationId, orgId, text, confidence, linkedDocIds]
        );
    }

    /**
     * Extract document IDs from LLM citations and retrieval results.
     */
    private extractLinkedDocIds(citations: string[], retrievalResults: RetrievalResult[]): string[] {
        const docIds: string[] = [];
        for (const citation of citations) {
            const match = citation.match(/\[(\d+)\]/);
            if (match) {
                const idx = parseInt(match[1], 10) - 1; // 1-indexed
                if (idx >= 0 && idx < retrievalResults.length) {
                    docIds.push(retrievalResults[idx].doc_id);
                }
            }
        }
        return [...new Set(docIds)];
    }
}
