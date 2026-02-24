import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/auth/auth.service';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import type { UserRole } from '../types/auth';
import { logger } from '../utils/logger';

// ─── Validation Schemas ───

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1),
    role: z.enum(['ORG_ADMIN', 'AGENT']).default('AGENT'),
    orgId: z.string().uuid(),
});

const REFRESH_COOKIE = 'wa_refresh_token';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export async function authRoutes(fastify: FastifyInstance) {

    // ─── POST /api/auth/login ───
    fastify.post<{ Body: { email: string; password: string } }>(
        '/api/auth/login',
        async (request, reply) => {
            const parsed = loginSchema.safeParse(request.body);
            if (!parsed.success) {
                reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
                return;
            }

            try {
                const result = await authService.login(parsed.data.email, parsed.data.password, {
                    userAgent: request.headers['user-agent'],
                    ip: request.ip,
                });

                // Set refresh token as HTTP-only cookie
                reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    path: '/api/auth',
                    maxAge: REFRESH_MAX_AGE,
                });

                return {
                    user: result.user,
                    accessToken: result.accessToken,
                };
            } catch (err: any) {
                if (err instanceof authService.AuthError) {
                    reply.code(err.statusCode).send({ error: err.message });
                    return;
                }
                logger.error({ err }, 'Login error');
                reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ─── POST /api/auth/refresh ───
    fastify.post('/api/auth/refresh', async (request, reply) => {
        const refreshToken = (request.cookies as any)?.[REFRESH_COOKIE];
        if (!refreshToken) {
            reply.code(401).send({ error: 'No refresh token provided' });
            return;
        }

        try {
            const result = await authService.refresh(refreshToken, {
                userAgent: request.headers['user-agent'],
                ip: request.ip,
            });

            // Rotate cookie
            reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/api/auth',
                maxAge: REFRESH_MAX_AGE,
            });

            return { accessToken: result.accessToken };
        } catch (err: any) {
            if (err instanceof authService.AuthError) {
                // Clear the bad cookie
                reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
                reply.code(err.statusCode).send({ error: err.message });
                return;
            }
            logger.error({ err }, 'Refresh error');
            reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // ─── POST /api/auth/logout ───
    fastify.post('/api/auth/logout', async (request, reply) => {
        const refreshToken = (request.cookies as any)?.[REFRESH_COOKIE];
        if (refreshToken) {
            await authService.logout(refreshToken);
        }
        reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
        return { message: 'Logged out' };
    });

    // ─── GET /api/auth/me ───
    fastify.get(
        '/api/auth/me',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const user = await authService.findUserById(request.authUser!.id);
            if (!user) {
                reply.code(404).send({ error: 'User not found' });
                return;
            }
            return { user };
        }
    );

    // ─── POST /api/auth/register ─── (ORG_ADMIN+ only)
    fastify.post<{
        Body: { email: string; password: string; name: string; role?: UserRole; orgId: string };
    }>(
        '/api/auth/register',
        { preHandler: [authenticate, requireRole(['SUPER_ADMIN', 'ORG_ADMIN'])] },
        async (request, reply) => {
            const parsed = registerSchema.safeParse(request.body);
            if (!parsed.success) {
                reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
                return;
            }

            const { email, password, name, role, orgId } = parsed.data;

            // ORG_ADMIN can only create agents in their own org
            if (request.authUser!.role === 'ORG_ADMIN') {
                if (role !== 'AGENT') {
                    reply.code(403).send({ error: 'ORG_ADMIN can only create AGENT users' });
                    return;
                }
                if (request.authUser!.orgId !== orgId) {
                    reply.code(403).send({ error: 'Cannot create users for another organization' });
                    return;
                }
            }

            try {
                const existing = await authService.findUserByEmail(email);
                if (existing) {
                    reply.code(409).send({ error: 'Email already registered' });
                    return;
                }

                const user = await authService.createUser({
                    email,
                    password,
                    name,
                    role: role as UserRole,
                    orgId,
                });

                reply.code(201);
                return { user };
            } catch (err: any) {
                logger.error({ err }, 'Registration error');
                reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );
}
