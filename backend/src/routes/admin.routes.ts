import { FastifyInstance } from 'fastify';
import { query, queryOne } from '../db';
import { Org } from '../types';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireOrgAccess } from '../middleware/rbac.middleware';

export async function adminRoutes(fastify: FastifyInstance) {
    // All admin routes require SUPER_ADMIN
    const adminGuard = { preHandler: [authenticate, requireRole(['SUPER_ADMIN'])] };

    // ─── Get all orgs ───
    fastify.get('/api/admin/orgs', adminGuard, async () => {
        const orgs = await query<Org>('SELECT * FROM orgs ORDER BY created_at DESC');
        return { orgs };
    });

    // ─── Create org ───
    fastify.post<{ Body: { name: string; slug: string } }>(
        '/api/admin/orgs',
        adminGuard,
        async (request, reply) => {
            const { name, slug } = request.body;
            const orgs = await query<Org>(
                `INSERT INTO orgs (name, slug) VALUES ($1, $2) RETURNING *`,
                [name, slug]
            );
            reply.code(201);
            return { org: orgs[0] };
        }
    );

    // ─── Get org by ID ───
    fastify.get<{ Params: { orgId: string } }>(
        '/api/admin/orgs/:orgId',
        adminGuard,
        async (request, reply) => {
            const org = await queryOne<Org>('SELECT * FROM orgs WHERE id = $1', [request.params.orgId]);
            if (!org) {
                reply.code(404);
                return { error: 'Org not found' };
            }
            return { org };
        }
    );

    // ─── Update org settings ───
    fastify.put<{ Params: { orgId: string }; Body: { settings: Record<string, unknown> } }>(
        '/api/admin/orgs/:orgId/settings',
        adminGuard,
        async (request, reply) => {
            const { settings } = request.body;
            const orgs = await query<Org>(
                `UPDATE orgs SET settings = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
                [request.params.orgId, JSON.stringify(settings)]
            );
            if (!orgs[0]) {
                reply.code(404);
                return { error: 'Org not found' };
            }
            return { org: orgs[0] };
        }
    );

    // ─── Get sessions for org ───
    fastify.get('/api/admin/sessions', adminGuard, async () => {
        const sessions = await query(
            `SELECT ws.*, o.name as org_name
       FROM whatsapp_sessions ws
       JOIN orgs o ON ws.org_id = o.id
       ORDER BY ws.updated_at DESC`
        );
        return { sessions };
    });

    // ─── Get session status ───
    fastify.get<{ Params: { orgId: string } }>(
        '/api/admin/sessions/:orgId/status',
        adminGuard,
        async (request) => {
            const { sessionManager } = fastify as any;
            const status = sessionManager?.getStatus(request.params.orgId) || 'disconnected';
            const dbSession = await queryOne(
                'SELECT * FROM whatsapp_sessions WHERE org_id = $1',
                [request.params.orgId]
            );
            return { status, session: dbSession };
        }
    );

    // ═══════════════════════════════════════════════════
    // Org-scoped session routes (SUPER_ADMIN + ORG_ADMIN)
    // ═══════════════════════════════════════════════════
    const orgGuard = { preHandler: [authenticate, requireRole(['SUPER_ADMIN', 'ORG_ADMIN']), requireOrgAccess] };

    // ─── List sessions for an org ───
    fastify.get<{ Params: { orgId: string } }>(
        '/api/sessions/:orgId',
        orgGuard,
        async (request) => {
            const { orgId } = request.params;
            const sessions = await query(
                `SELECT ws.*, o.name as org_name
                 FROM whatsapp_sessions ws
                 JOIN orgs o ON ws.org_id = o.id
                 WHERE ws.org_id = $1
                 ORDER BY ws.updated_at DESC`,
                [orgId]
            );
            return { sessions };
        }
    );

    // ─── Disconnect session for an org ───
    fastify.delete<{ Params: { orgId: string } }>(
        '/api/sessions/:orgId',
        orgGuard,
        async (request) => {
            const { sessionManager } = fastify as any;
            await sessionManager.destroySession(request.params.orgId);
            return { status: 'disconnected' };
        }
    );
}
