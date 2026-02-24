import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryOne } from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { User, SafeUser, AccessTokenPayload, RefreshTokenPayload, UserRole } from '../../types/auth';

const BCRYPT_ROUNDS = 10;

// ─── Password Hashing ───

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ─── Token Generation ───

function parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 900; // default 15m
    const value = parseInt(match[1], 10);
    switch (match[2]) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return 900;
    }
}

export function generateAccessToken(user: SafeUser): string {
    const payload: AccessTokenPayload = {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.org_id,
    };
    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: parseExpiry(config.jwtAccessExpiresIn),
    });
}

export function generateRefreshToken(userId: string, tokenId: string): string {
    const payload: RefreshTokenPayload = {
        sub: userId,
        tokenId,
    };
    return jwt.sign(payload, config.jwtRefreshSecret, {
        expiresIn: parseExpiry(config.jwtRefreshExpiresIn),
    });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
}

export function verifyRefreshTokenJWT(token: string): RefreshTokenPayload {
    return jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
}

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── User Operations ───

export async function findUserByEmail(email: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
}

export async function findUserById(id: string): Promise<SafeUser | null> {
    return queryOne<SafeUser>(
        'SELECT id, org_id, email, name, role, is_active, last_login_at, created_at, updated_at FROM users WHERE id = $1',
        [id]
    );
}

export async function createUser(params: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    orgId: string | null;
}): Promise<SafeUser> {
    const passwordHash = await hashPassword(params.password);
    const rows = await query<SafeUser>(
        `INSERT INTO users (email, password_hash, name, role, org_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, org_id, email, name, role, is_active, last_login_at, created_at, updated_at`,
        [params.email, passwordHash, params.name, params.role, params.orgId]
    );
    return rows[0];
}

// ─── Login Flow ───

export interface LoginResult {
    user: SafeUser;
    accessToken: string;
    refreshToken: string;
}

export async function login(
    email: string,
    password: string,
    meta: { userAgent?: string; ip?: string }
): Promise<LoginResult> {
    const user = await findUserByEmail(email);
    if (!user) throw new AuthError('Invalid email or password', 401);
    if (!user.is_active) throw new AuthError('Account is disabled', 403);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) throw new AuthError('Invalid email or password', 401);

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const safeUser: SafeUser = {
        id: user.id,
        org_id: user.org_id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
        last_login_at: new Date().toISOString(),
        created_at: user.created_at,
        updated_at: user.updated_at,
    };

    // Generate tokens
    const accessToken = generateAccessToken(safeUser);

    // Create refresh token with a single INSERT (no placeholder)
    const tempTokenId = crypto.randomUUID();
    const refreshToken = generateRefreshToken(user.id, tempTokenId);
    const tokenHash = hashToken(refreshToken);

    const expiresInSeconds = parseExpiry(config.jwtRefreshExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    await query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, $5::inet, $6)`,
        [tempTokenId, user.id, tokenHash, meta.userAgent || null, meta.ip || null, expiresAt]
    );

    logger.info({ userId: user.id, role: user.role }, 'User logged in');
    return { user: safeUser, accessToken, refreshToken };
}

// ─── Refresh Flow ───

export async function refresh(
    rawRefreshToken: string,
    meta: { userAgent?: string; ip?: string }
): Promise<{ accessToken: string; refreshToken: string }> {
    // Verify JWT signature + expiry
    let payload: RefreshTokenPayload;
    try {
        payload = verifyRefreshTokenJWT(rawRefreshToken);
    } catch {
        throw new AuthError('Invalid refresh token', 401);
    }

    // Look up token record
    const tokenHash = hashToken(rawRefreshToken);
    const tokenRecord = await queryOne<{ id: string; user_id: string; revoked_at: string | null }>(
        'SELECT id, user_id, revoked_at FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()',
        [tokenHash]
    );

    if (!tokenRecord || tokenRecord.revoked_at) {
        throw new AuthError('Refresh token revoked or expired', 401);
    }

    // Revoke old token (rotation)
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [tokenRecord.id]);

    // Get user
    const user = await findUserById(payload.sub);
    if (!user || !user.is_active) throw new AuthError('User not found or disabled', 401);

    // Issue new pair
    const accessToken = generateAccessToken(user);

    // Create new refresh token with a single INSERT (no placeholder)
    const newTokenId = crypto.randomUUID();
    const newRefreshToken = generateRefreshToken(user.id, newTokenId);
    const newTokenHash = hashToken(newRefreshToken);

    const expiresInSeconds = parseExpiry(config.jwtRefreshExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    await query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, $5::inet, $6)`,
        [newTokenId, user.id, newTokenHash, meta.userAgent || null, meta.ip || null, expiresAt]
    );

    return { accessToken, refreshToken: newRefreshToken };
}

// ─── Logout (Revoke Refresh Token) ───

export async function logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
}

export async function logoutAllSessions(userId: string): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

// ─── Error Class ───

export class AuthError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode = 401) {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
    }
}
