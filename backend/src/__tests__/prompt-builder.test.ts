import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, buildLLMPayload } from '../services/llm/prompt-builder';
import { ChatContext } from '../types';

// ─── Sample context for testing ───
function createMockContext(): ChatContext {
    return {
        conversation_history: [
            {
                id: 'msg-001',
                timestamp: '2024-12-15T10:00:00Z',
                direction: 'inbound',
                sender_role: 'customer',
                text: 'Hi, I want to know about Widget Pro',
                media_meta: null,
                linked_doc_ids: [],
            },
            {
                id: 'msg-002',
                timestamp: '2024-12-15T10:00:05Z',
                direction: 'outbound',
                sender_role: 'bot',
                text: 'Widget Pro features a 10-inch display and 8GB RAM. Sources: [1] | Confidence: 0.92',
                media_meta: null,
                linked_doc_ids: ['doc-001'],
            },
        ],
        customer_profile: {
            customer_id: 'cust-001',
            phone_number: '+919876543210',
            name: 'Test Customer',
            first_seen_at: '2024-01-15T00:00:00Z',
            order_count: 3,
            tags: ['vip', 'repeat'],
            last_order_summary: 'Order #1234: 2x Widget Pro, delivered 2024-12-01',
        },
        session_metadata: {
            session_id: 'sess-001',
            org_id: 'org-001',
            whatsapp_phone: '+14155551234',
            session_status: 'ready',
            business_hours_flag: true,
        },
        automation_config: {
            scope: 'all',
            fallback_message: 'I don\'t know based on our documents. Would you like to connect to a human?',
            escalation_rules: [
                { type: 'low_confidence', threshold: 0.7, action: 'escalate' },
            ],
        },
        retrieval_results: [
            {
                doc_id: 'doc-001',
                title: 'Product FAQ',
                source_url: 'https://democorp.com/faq',
                chunk_text: 'Widget Pro is our flagship product. It features a 10-inch display, 8GB RAM, and comes with a 2-year warranty. Price: $299.',
                chunk_score: 0.92,
            },
            {
                doc_id: 'doc-002',
                title: 'Return Policy',
                source_url: 'https://democorp.com/returns',
                chunk_text: 'Returns are accepted within 30 days of purchase. Items must be in original packaging.',
                chunk_score: 0.78,
            },
        ],
        previous_bot_answers: [
            {
                message_id: 'msg-002',
                text: 'Widget Pro features a 10-inch display and 8GB RAM.',
                confidence: 0.92,
                customer_confirmed: false,
                timestamp: '2024-12-15T10:00:05Z',
            },
        ],
    };
}

describe('Prompt Builder', () => {
    describe('buildSystemPrompt', () => {
        it('should include anti-hallucination directives', () => {
            const prompt = buildSystemPrompt('Demo Corp');

            expect(prompt).toContain('Demo Corp');
            expect(prompt).toContain('ONLY use information from the PROVIDED SOURCES');
            expect(prompt).toContain('NEVER make up information');
            expect(prompt).toContain('cite your sources');
            expect(prompt).toContain('[1]');
            expect(prompt).toContain('Confidence:');
        });

        it('should forbid fabrication explicitly', () => {
            const prompt = buildSystemPrompt('TestOrg');

            expect(prompt).toContain('Do NOT generate, fabricate, guess, or infer');
            expect(prompt).toContain('not explicitly stated in the provided sources');
        });

        it('should require numbered citations format', () => {
            const prompt = buildSystemPrompt('TestOrg');

            expect(prompt).toContain('Sources: [1], [2]');
            expect(prompt).toContain('Confidence: X.XX');
        });
    });

    describe('buildUserPrompt', () => {
        it('should include all context sections', () => {
            const context = createMockContext();
            const prompt = buildUserPrompt('What is the return policy?', context);

            // Retrieval results
            expect(prompt).toContain('Source Documents');
            expect(prompt).toContain('Widget Pro is our flagship product');
            expect(prompt).toContain('Returns are accepted within 30 days');

            // Conversation history
            expect(prompt).toContain('Conversation History');
            expect(prompt).toContain('Hi, I want to know about Widget Pro');

            // Customer profile
            expect(prompt).toContain('Customer Profile');
            expect(prompt).toContain('+919876543210');
            expect(prompt).toContain('vip');

            // Session metadata
            expect(prompt).toContain('Session Info');
            expect(prompt).toContain('org-001');

            // Current message
            expect(prompt).toContain('What is the return policy?');
        });

        it('should handle empty retrieval results', () => {
            const context = createMockContext();
            context.retrieval_results = [];

            const prompt = buildUserPrompt('Random question', context);
            expect(prompt).toContain('No relevant documents found');
        });

        it('should include previous bot answers', () => {
            const context = createMockContext();
            const prompt = buildUserPrompt('Follow up', context);

            expect(prompt).toContain('Previous Bot Answers');
        });
    });

    describe('buildLLMPayload', () => {
        it('should produce a valid LLM payload with all required fields', () => {
            const context = createMockContext();
            const payload = buildLLMPayload('Demo Corp', 'What is the price?', context);

            expect(payload).toHaveProperty('system_prompt');
            expect(payload).toHaveProperty('messages');
            expect(payload.messages).toHaveLength(1);
            expect(payload.messages[0].role).toBe('user');
            expect(payload.temperature).toBe(0.2);

            // Verify system prompt has anti-hallucination
            expect(payload.system_prompt).toContain('ONLY use information');

            // Verify user message has context
            expect(payload.messages[0].content).toContain('Source Documents');
            expect(payload.messages[0].content).toContain('Conversation History');
        });
    });
});
