-- Auth seed data for development
-- Creates a default SUPER_ADMIN user and an ORG_ADMIN for Demo Corp
--
-- IMPORTANT: The password hashes below are bcrypt hashes of "admin123" (cost=10).
-- In production, users should change their passwords immediately after first login.
--
-- Password for all seeded users: admin123

-- Insert the Demo Corp organization first to satisfy Foreign Key constraints
INSERT INTO orgs (id, name, slug) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    'Demo Corp',
    'demo-corp'
) ON CONFLICT (slug) DO NOTHING;

-- Super Admin (system-wide, no org)
INSERT INTO users (id, org_id, email, password_hash, name, role) VALUES (
    '550e8400-e29b-41d4-a716-446655440100',
    NULL,
    'superadmin@wa-automation.local',
    -- bcrypt hash of "admin123"
    '$2b$10$4vDq8twMkgPQXCOTHNa53uNdmLQtAU9K0E1qvfjB7kK0j6BneGQgm',
    'Super Admin',
    'SUPER_ADMIN'
) ON CONFLICT (email) DO NOTHING;

-- Org Admin for Demo Corp
INSERT INTO users (id, org_id, email, password_hash, name, role) VALUES (
    '550e8400-e29b-41d4-a716-446655440101',
    '550e8400-e29b-41d4-a716-446655440001',
    'admin@democorp.com',
    -- bcrypt hash of "admin123"
    '$2b$10$4vDq8twMkgPQXCOTHNa53uNdmLQtAU9K0E1qvfjB7kK0j6BneGQgm',
    'Demo Corp Admin',
    'ORG_ADMIN'
) ON CONFLICT (email) DO NOTHING;

-- Agent for Demo Corp
INSERT INTO users (id, org_id, email, password_hash, name, role) VALUES (
    '550e8400-e29b-41d4-a716-446655440102',
    '550e8400-e29b-41d4-a716-446655440001',
    'agent@democorp.com',
    -- bcrypt hash of "admin123"
    '$2b$10$4vDq8twMkgPQXCOTHNa53uNdmLQtAU9K0E1qvfjB7kK0j6BneGQgm',
    'Demo Agent',
    'AGENT'
) ON CONFLICT (email) DO NOTHING;
