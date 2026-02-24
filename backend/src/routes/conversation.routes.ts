import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { Message } from '../types';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireOrgAccess } from '../middleware/rbac.middleware';

export async function conversationRoutes(fastify: FastifyInstance) {
    // All authenticated users can view conversations
    const authGuard = { preHandler: [authenticate, requireOrgAccess] };

    // ─── Get conversation history ───
    fastify.get<{ Params: { customerId: string }; Querystring: { orgId: string; limit?: string } }>(
        '/api/conversations/:customerId/history',
        authGuard,
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

    // ─── Developer: Re-run RAG for testing (SUPER_ADMIN only) ───
    fastify.post<{ Body: { orgId: string; query: string; topK?: number } }>(
        '/api/dev/rag-test',
        { preHandler: [authenticate, requireRole(['SUPER_ADMIN'])] },
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
