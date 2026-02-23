import { FastifyInstance } from 'fastify';
import { Escalation } from '../types';

export async function escalationRoutes(fastify: FastifyInstance) {
    // ─── Get pending escalations ───
    fastify.get<{ Querystring: { orgId: string } }>(
        '/api/escalations',
        async (request) => {
            const { escalationService } = fastify as any;
            const escalations = await escalationService.getPendingEscalations(request.query.orgId);
            return { escalations };
        }
    );

    // ─── Get escalation stats ───
    fastify.get<{ Querystring: { orgId: string } }>(
        '/api/escalations/stats',
        async (request) => {
            const { escalationService } = fastify as any;
            const stats = await escalationService.getStats(request.query.orgId);
            return { stats };
        }
    );

    // ─── Operator takes over ───
    fastify.post<{ Params: { id: string }; Body: { operatorName: string } }>(
        '/api/escalations/:id/takeover',
        async (request, reply) => {
            const { escalationService } = fastify as any;
            const escalation = await escalationService.takeover(
                request.params.id,
                request.body.operatorName
            );
            if (!escalation) {
                reply.code(404);
                return { error: 'Escalation not found' };
            }
            return { escalation };
        }
    );

    // ─── Resolve escalation ───
    fastify.post<{ Params: { id: string } }>(
        '/api/escalations/:id/resolve',
        async (request, reply) => {
            const { escalationService } = fastify as any;
            const escalation = await escalationService.resolve(request.params.id);
            if (!escalation) {
                reply.code(404);
                return { error: 'Escalation not found' };
            }
            return { escalation };
        }
    );
}
