import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { Message } from '../types';

export async function conversationRoutes(fastify: FastifyInstance) {
    // ─── Get conversation history ───
    fastify.get<{ Params: { customerId: string }; Querystring: { orgId: string; limit?: string } }>(
        '/api/conversations/:customerId/history',
        async (request) => {
            const { orgId, limit } = request.query;
            const maxMessages = parseInt(limit || '50', 10);

            const messages = await query<Message>(
                `SELECT m.* FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.customer_id = $1 AND c.org_id = $2
         ORDER BY m.timestamp DESC
         LIMIT $3`,
                [request.params.customerId, orgId, maxMessages]
            );

            return { messages: messages.reverse() };
        }
    );

    // ─── Developer: Re-run RAG for testing ───
    fastify.post<{ Body: { orgId: string; query: string; topK?: number } }>(
        '/api/dev/rag-test',
        async (request) => {
            const { orgId, query: queryText, topK } = request.body;
            const { retrievalService } = fastify as any;

            if (!retrievalService) {
                return { error: 'Retrieval service not available' };
            }

            const result = await retrievalService.retrieve(orgId, queryText, topK || 4);
            return {
                query: queryText,
                results: result.results,
                aggregateConfidence: result.aggregateConfidence,
            };
        }
    );
}
