-- WhatsApp Automation — Auth & RBAC Schema
-- Migration 002: Users, roles, refresh tokens

-- ─── Users ───
-- Roles embedded directly in the users table (no separate junction table needed for 3 roles)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,  -- NULL for SUPER_ADMIN (system-wide)
    email VARCHAR(320) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'AGENT'
        CHECK (role IN ('SUPER_ADMIN', 'ORG_ADMIN', 'AGENT')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ─── Refresh Tokens ───
-- Stored server-side so we can revoke sessions / implement token rotation
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,         -- SHA-256 hash of the actual token
    user_agent TEXT,                         -- browser/device info
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,                  -- NULL = active, set = revoked
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ─── Update escalations.assigned_to to reference users ───
-- Add a nullable FK column for the assigned user
ALTER TABLE escalations ADD COLUMN assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_escalations_assigned_user ON escalations(assigned_user_id);

-- ─── Updated-at triggers for new tables ───
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();