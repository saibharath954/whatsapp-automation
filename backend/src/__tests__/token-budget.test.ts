import { describe, it, expect, vi } from 'vitest';
import { TokenBudgetManager } from '../services/context/token-budget';
import { ChatContext } from '../types';

function createLargeContext(): ChatContext {
    // Create a context that exceeds token budget
    const longMessages = Array.from({ length: 60 }, (_, i) => ({
        id: `msg-${i}`,
        timestamp: new Date(Date.now() - (60 - i) * 60000).toISOString(),
        direction: (i % 2 === 0 ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
        sender_role: (i % 2 === 0 ? 'customer' : 'bot') as 'customer' | 'bot',
        text: 'A'.repeat(200), // Long messages
        media_meta: null,
        linked_doc_ids: [],
    }));

    return {
        conversation_history: longMessages,
        customer_profile: {
            customer_id: 'cust-001',
            phone_number: '+1234567890',
            name: 'Test',
            first_seen_at: '2024-01-01T00:00:00Z',
            order_count: 5,
            tags: ['tag1', 'tag2'],
            last_order_summary: 'Order info here',
        },
        session_metadata: {
            session_id: 'sess-001',
            org_id: 'org-001',
            whatsapp_phone: '+1234567890',
            session_status: 'ready',
            business_hours_flag: true,
        },
        automation_config: {
            scope: 'all',
            fallback_message: 'Fallback message',
            escalation_rules: [],
        },
        retrieval_results: [
            {
                doc_id: 'doc-001',
                title: 'Test Doc',
                source_url: null,
                chunk_text: 'B'.repeat(1000),
                chunk_score: 0.9,
            },
        ],
        previous_bot_answers: Array.from({ length: 15 }, (_, i) => ({
            message_id: `bot-${i}`,
            text: 'C'.repeat(200),
            confidence: 0.85,
            customer_confirmed: false,
            timestamp: new Date().toISOString(),
        })),
    };
}

describe('TokenBudgetManager', () => {
    it('should not trim context that fits within budget', () => {
        const manager = new TokenBudgetManager(50000); // Very large budget
        const context: ChatContext = {
            conversation_history: [{
                id: 'msg-1', timestamp: new Date().toISOString(),
                direction: 'inbound', sender_role: 'customer', text: 'Hello',
                media_meta: null, linked_doc_ids: [],
            }],
            customer_profile: {
                customer_id: 'c1', phone_number: '+1', name: 'A',
                first_seen_at: '2024-01-01T00:00:00Z', order_count: 0,
                tags: [], last_order_summary: null,
            },
            session_metadata: {
                session_id: 's1', org_id: 'o1', whatsapp_phone: '+1',
                session_status: 'ready', business_hours_flag: true,
            },
            automation_config: { scope: 'all', fallback_message: 'fb', escalation_rules: [] },
            retrieval_results: [],
            previous_bot_answers: [],
        };

        const trimmed = manager.trimContext(context);
        expect(trimmed.conversation_history).toHaveLength(1);
    });

    it('should trim conversation history when budget is tight', () => {
        const manager = new TokenBudgetManager(2000); // Small budget
        const context = createLargeContext();

        const trimmed = manager.trimContext(context);

        // History should be trimmed
        expect(trimmed.conversation_history.length).toBeLessThan(60);
        // Retrieval results should be preserved (highest priority)
        expect(trimmed.retrieval_results).toHaveLength(1);
    });

    it('should trim previous bot answers first', () => {
        const manager = new TokenBudgetManager(3000);
        const context = createLargeContext();

        const trimmed = manager.trimContext(context);

        // Bot answers trimmed to max 3
        expect(trimmed.previous_bot_answers.length).toBeLessThanOrEqual(3);
    });

    it('should preserve retrieval results as highest priority', () => {
        const manager = new TokenBudgetManager(500); // Very tight budget
        const context = createLargeContext();

        const trimmed = manager.trimContext(context);

        // Retrieval should always be present
        expect(trimmed.retrieval_results.length).toBeGreaterThan(0);
    });

    it('should estimate tokens reasonably', () => {
        const manager = new TokenBudgetManager();
        const context = createLargeContext();

        const tokens = manager.estimateTokens(context);
        expect(tokens).toBeGreaterThan(0);
        expect(typeof tokens).toBe('number');
    });
});
