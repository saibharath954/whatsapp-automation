import { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '../types/auth';

/**
 * Factory that returns a Fastify preHandler hook enforcing role-based access.
 * Must be used AFTER `authenticate` middleware so `request.authUser` is available.
 *
 * @param allowedRoles - Roles that are permitted to access this route
 *
 * @example
 *   fastify.get('/api/admin/orgs', {
 *     preHandler: [authenticate, requireRole(['SUPER_ADMIN'])],
 *   }, handler);
 */
export function requireRole(allowedRoles: UserRole[]) {
    return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const user = request.authUser;
        if (!user) {
            reply.code(401).send({ error: 'Authentication required' });
            return;
        }

        if (!allowedRoles.includes(user.role)) {
            reply.code(403).send({
                error: 'Insufficient permissions',
                required: allowedRoles,
                current: user.role,
            });
            return;
        }
    };
}

/**
 * Middleware that enforces the user belongs to the org specified in the route.
 * SUPER_ADMIN bypasses this check (system-wide access).
 * Expects `request.params.orgId` or `request.query.orgId` or `request.body.orgId`.
 */
export async function requireOrgAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.authUser;
    if (!user) {
        reply.code(401).send({ error: 'Authentication required' });
        return;
    }

    // SUPER_ADMIN has access to all orgs
    if (user.role === 'SUPER_ADMIN') return;

    // Extract orgId from params, query, or body
    const orgId =
        (request.params as any)?.orgId ||
        (request.query as any)?.orgId ||
        (request.body as any)?.orgId;

    if (!orgId) {
        // No orgId in request — let the route handler deal with it
        return;
    }

    if (user.orgId !== orgId) {
        reply.code(403).send({ error: 'Access denied to this organization' });
        return;
    }
}
