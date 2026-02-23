import { FastifyInstance } from 'fastify';
import { query, queryOne } from '../db';
import { Automation } from '../types';

export async function automationRoutes(fastify: FastifyInstance) {
    // ─── Get automation config for org ───
    fastify.get<{ Params: { orgId: string } }>(
        '/api/automations/:orgId',
        async (request, reply) => {
            const automation = await queryOne<Automation>(
                'SELECT * FROM automations WHERE org_id = $1',
                [request.params.orgId]
            );
            if (!automation) {
                reply.code(404);
                return { error: 'Automation config not found' };
            }
            return { automation };
        }
    );

    // ─── Update automation config ───
    fastify.put<{
        Params: { orgId: string };
        Body: { scope?: string; enabled?: boolean; fallback_message?: string; escalation_rules?: unknown[] };
    }>('/api/automations/:orgId', async (request, reply) => {
        const { scope, enabled, fallback_message, escalation_rules } = request.body;

        const existing = await queryOne<Automation>(
            'SELECT * FROM automations WHERE org_id = $1',
            [request.params.orgId]
        );

        if (!existing) {
            // Create new
            const rows = await query<Automation>(
                `INSERT INTO automations (org_id, scope, enabled, fallback_message, escalation_rules)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [
                    request.params.orgId,
                    scope || 'all',
                    enabled ?? true,
                    fallback_message || 'I don\'t know based on our documents. Would you like to connect to a human?',
                    JSON.stringify(escalation_rules || []),
                ]
            );
            reply.code(201);
            return { automation: rows[0] };
        }

        // Update
        const rows = await query<Automation>(
            `UPDATE automations SET
        scope = COALESCE($2, scope),
        enabled = COALESCE($3, enabled),
        fallback_message = COALESCE($4, fallback_message),
        escalation_rules = COALESCE($5, escalation_rules),
        updated_at = NOW()
       WHERE org_id = $1 RETURNING *`,
            [
                request.params.orgId,
                scope || null,
                enabled ?? null,
                fallback_message || null,
                escalation_rules ? JSON.stringify(escalation_rules) : null,
            ]
        );
        return { automation: rows[0] };
    });
}
