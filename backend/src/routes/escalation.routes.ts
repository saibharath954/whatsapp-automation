import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireOrgAccess } from '../middleware/rbac.middleware';

export async function escalationRoutes(fastify: FastifyInstance) {
    // All authenticated users can view escalations (AGENT, ORG_ADMIN, SUPER_ADMIN)
    const authGuard = {
        preHandler: [authenticate, requireOrgAccess],
    };

    // ─── Get pending escalations ───
    fastify.get<{ Querystring: { orgId: string } }>(
        '/api/escalations',
        authGuard,
        async (request) => {
            const { escalationService } = fastify as any;
            const escalations = await escalationService.getPendingEscalations(request.query.orgId);
            return { escalations };
        }
    );

    // ─── Get escalation stats ───
    fastify.get<{ Querystring: { orgId: string } }>(
        '/api/escalations/stats',
        authGuard,
        async (request) => {
            const { escalationService } = fastify as any;
            const stats = await escalationService.getStats(request.query.orgId);
            return { stats };
        }
    );

    // ─── Operator takes over ───
    fastify.post<{ Params: { id: string }; Body: { operatorName: string } }>(
        '/api/escalations/:id/takeover',
        { preHandler: [authenticate] },
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
        { preHandler: [authenticate] },
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
