// ─── Auth & RBAC Types ───

export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'AGENT';

export interface User {
    id: string;
    org_id: string | null;
    email: string;
    password_hash: string;
    name: string;
    role: UserRole;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
}

/** Safe user object — never expose password_hash */
export type SafeUser = Omit<User, 'password_hash'>;

export interface RefreshTokenRecord {
    id: string;
    user_id: string;
    token_hash: string;
    user_agent: string | null;
    ip_address: string | null;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
}

/** JWT access token payload */
export interface AccessTokenPayload {
    sub: string;       // user.id
    email: string;
    name: string;
    role: UserRole;
    orgId: string | null;
}

/** JWT refresh token payload */
export interface RefreshTokenPayload {
    sub: string;       // user.id
    tokenId: string;   // refresh_tokens.id — enables targeted revocation
}

/** What gets attached to Fastify request after auth middleware */
export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    orgId: string | null;
}
