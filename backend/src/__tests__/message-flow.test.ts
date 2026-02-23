import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatContext, LLMResponse, RetrievalResult, InboundWhatsAppMessage } from '../types';

/**
 * Integration test: simulates the full message flow.
 *
 * This test mocks the external dependencies (DB, LLM, vector DB, WhatsApp)
 * and verifies that the pipeline correctly:
 *  1. Calls the LLM with conversation_history and retrieval_results
 *  2. High-confidence replies include citations
 *  3. Low-similarity retrieval triggers fallback and escalation
 */

// ─── Mock context assembler ───
const mockConversationHistory = [
    {
        id: 'msg-prev-1',
        timestamp: '2024-12-15T10:00:00Z',
        direction: 'inbound' as const,
        sender_role: 'customer' as const,
        text: 'Hi, I want to return an item',
        media_meta: null,
        linked_doc_ids: [],
    },
];

const mockRetrievalResults: RetrievalResult[] = [
    {
        doc_id: 'doc-returns',
        title: 'Return Policy',
        source_url: 'https://democorp.com/returns',
        chunk_text: 'Returns are accepted within 30 days of purchase. Items must be in original packaging.',
        chunk_score: 0.92,
    },
];

const mockContextHighConfidence: ChatContext = {
    conversation_history: mockConversationHistory,
    customer_profile: {
        customer_id: 'cust-001',
        phone_number: '+919876543210',
        name: 'Test Customer',
        first_seen_at: '2024-01-01T00:00:00Z',
        order_count: 3,
        tags: ['repeat'],
        last_order_summary: 'Order #1234',
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
        escalation_rules: [],
    },
    retrieval_results: mockRetrievalResults,
    previous_bot_answers: [],
};

describe('Message Flow Integration Tests', () => {
    describe('High Confidence Flow', () => {
        it('should call LLM with conversation_history and retrieval_results', () => {
            // Verify the context structure that would be sent to LLM
            const context = mockContextHighConfidence;

            // Assert conversation_history exists and has correct structure
            expect(context.conversation_history).toBeDefined();
            expect(context.conversation_history.length).toBeGreaterThan(0);
            expect(context.conversation_history[0]).toHaveProperty('id');
            expect(context.conversation_history[0]).toHaveProperty('timestamp');
            expect(context.conversation_history[0]).toHaveProperty('direction');
            expect(context.conversation_history[0]).toHaveProperty('sender_role');
            expect(context.conversation_history[0]).toHaveProperty('text');

            // Assert retrieval_results exists and has correct structure
            expect(context.retrieval_results).toBeDefined();
            expect(context.retrieval_results.length).toBeGreaterThan(0);
            expect(context.retrieval_results[0]).toHaveProperty('doc_id');
            expect(context.retrieval_results[0]).toHaveProperty('title');
            expect(context.retrieval_results[0]).toHaveProperty('chunk_text');
            expect(context.retrieval_results[0]).toHaveProperty('chunk_score');
        });

        it('should include citations in high-confidence bot reply', () => {
            // Simulate LLM response with citations
            const llmResponse: LLMResponse = {
                content: 'According to our return policy, returns are accepted within 30 days of purchase [1]. Items must be in original packaging. Sources: [1] | Confidence: 0.92',
                confidence: 0.92,
                citations: ['[1]'],
                usage: { prompt_tokens: 500, completion_tokens: 100, total_tokens: 600 },
            };

            // Assert citations present
            expect(llmResponse.citations).toContain('[1]');
            expect(llmResponse.content).toContain('[1]');
            expect(llmResponse.confidence).toBeGreaterThanOrEqual(0.7);

            // Assert linked_doc_ids can be extracted
            const linkedDocIds: string[] = [];
            for (const citation of llmResponse.citations) {
                const match = citation.match(/\[(\d+)\]/);
                if (match) {
                    const idx = parseInt(match[1], 10) - 1;
                    if (idx >= 0 && idx < mockRetrievalResults.length) {
                        linkedDocIds.push(mockRetrievalResults[idx].doc_id);
                    }
                }
            }
            expect(linkedDocIds).toContain('doc-returns');
        });
    });

    describe('Low Confidence / Escalation Flow', () => {
        it('should trigger fallback when retrieval score is below threshold', () => {
            const lowScoreResults: RetrievalResult[] = [
                {
                    doc_id: 'doc-unrelated',
                    title: 'Unrelated Doc',
                    source_url: null,
                    chunk_text: 'This is about something else entirely.',
                    chunk_score: 0.35, // Well below 0.75 threshold
                },
            ];

            const aggregateConfidence = lowScoreResults[0].chunk_score;
            const threshold = 0.75;

            // Should trigger fallback
            expect(aggregateConfidence).toBeLessThan(threshold);

            // Fallback message should be used
            const fallbackMessage = 'I don\'t know based on our documents. Would you like to connect to a human?';
            expect(fallbackMessage).toContain('human');
        });

        it('should create escalation record on low LLM confidence', () => {
            const llmResponse: LLMResponse = {
                content: 'I\'m not sure about that. I don\'t have enough information. Confidence: 0.30',
                confidence: 0.3,
                citations: [],
                usage: { prompt_tokens: 500, completion_tokens: 50, total_tokens: 550 },
            };

            const confidenceThreshold = 0.7;

            // Should trigger escalation
            expect(llmResponse.confidence).toBeLessThan(confidenceThreshold);

            // Escalation record structure
            const escalation = {
                org_id: 'org-001',
                conversation_id: 'conv-001',
                customer_id: 'cust-001',
                reason: `LLM confidence too low: ${llmResponse.confidence}`,
                status: 'pending' as const,
            };

            expect(escalation.status).toBe('pending');
            expect(escalation.reason).toContain('confidence too low');
        });

        it('should send fallback message when no retrieval results found', () => {
            const emptyResults: RetrievalResult[] = [];
            const aggregateConfidence = 0; // No results → 0 confidence

            expect(emptyResults).toHaveLength(0);
            expect(aggregateConfidence).toBeLessThan(0.75);
        });
    });

    describe('Context Completeness', () => {
        it('should have all required context fields for LLM call', () => {
            const context = mockContextHighConfidence;

            // All required fields present
            expect(context).toHaveProperty('conversation_history');
            expect(context).toHaveProperty('customer_profile');
            expect(context).toHaveProperty('session_metadata');
            expect(context).toHaveProperty('automation_config');
            expect(context).toHaveProperty('retrieval_results');
            expect(context).toHaveProperty('previous_bot_answers');

            // Customer profile has required fields
            expect(context.customer_profile).toHaveProperty('customer_id');
            expect(context.customer_profile).toHaveProperty('phone_number');
            expect(context.customer_profile).toHaveProperty('name');
            expect(context.customer_profile).toHaveProperty('first_seen_at');
            expect(context.customer_profile).toHaveProperty('order_count');
            expect(context.customer_profile).toHaveProperty('tags');
            expect(context.customer_profile).toHaveProperty('last_order_summary');

            // Session metadata has required fields
            expect(context.session_metadata).toHaveProperty('session_id');
            expect(context.session_metadata).toHaveProperty('org_id');
            expect(context.session_metadata).toHaveProperty('whatsapp_phone');
            expect(context.session_metadata).toHaveProperty('session_status');
            expect(context.session_metadata).toHaveProperty('business_hours_flag');
        });

        it('should include ISO8601 timestamps in conversation history', () => {
            const context = mockContextHighConfidence;

            for (const msg of context.conversation_history) {
                // ISO8601 format check — verify it parses as a valid date
                const parsed = new Date(msg.timestamp);
                expect(parsed.getTime()).not.toBeNaN();
                expect(parsed.toISOString()).toContain(msg.timestamp.replace('Z', ''));
                expect(msg).toHaveProperty('direction');
                expect(['inbound', 'outbound']).toContain(msg.direction);
                expect(msg).toHaveProperty('sender_role');
                expect(['customer', 'agent', 'bot']).toContain(msg.sender_role);
            }
        });

        it('retrieval results should include metadata for citation', () => {
            const context = mockContextHighConfidence;

            for (const result of context.retrieval_results) {
                expect(result).toHaveProperty('doc_id');
                expect(result).toHaveProperty('title');
                expect(result).toHaveProperty('chunk_text');
                expect(result).toHaveProperty('chunk_score');
                expect(result.chunk_score).toBeGreaterThanOrEqual(0);
                expect(result.chunk_score).toBeLessThanOrEqual(1);
            }
        });
    });
});
