import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../services/auth/auth.service';
import type { AuthUser } from '../types/auth';
import { logger } from '../utils/logger';

// Extend Fastify request with auth user
declare module 'fastify' {
    interface FastifyRequest {
        authUser?: AuthUser;
    }
}

/**
 * Fastify preHandler hook that verifies the JWT access token in the Authorization header.
 * On success, attaches `request.authUser` with the decoded user info.
 * On failure, returns 401 Unauthorized.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'Missing or malformed Authorization header' });
        return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer '

    try {
        const payload = verifyAccessToken(token);
        request.authUser = {
            id: payload.sub,
            email: payload.email,
            name: payload.name,
            role: payload.role,
            orgId: payload.orgId,
        };
    } catch (err: any) {
        logger.debug({ err: err.message }, 'JWT verification failed');
        if (err.name === 'TokenExpiredError') {
            reply.code(401).send({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
        } else {
            reply.code(401).send({ error: 'Invalid access token' });
        }
    }
}
