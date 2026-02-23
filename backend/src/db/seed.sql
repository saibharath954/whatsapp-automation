-- Seed data for development
-- Inserts a sample org, automation config, and test customer

INSERT INTO orgs (id, name, slug, settings) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    'Demo Corp',
    'demo-corp',
    '{
        "business_hours": {
            "enabled": true,
            "timezone": "Asia/Kolkata",
            "schedule": {
                "monday": {"start": "09:00", "end": "18:00"},
                "tuesday": {"start": "09:00", "end": "18:00"},
                "wednesday": {"start": "09:00", "end": "18:00"},
                "thursday": {"start": "09:00", "end": "18:00"},
                "friday": {"start": "09:00", "end": "18:00"},
                "saturday": null,
                "sunday": null
            }
        },
        "fallback_message": "I don''t have enough information to answer that accurately. Would you like to speak with a human agent?",
        "escalation_message": "Let me connect you with a human agent who can help better. Please hold on.",
        "max_context_messages": 50,
        "max_context_days": 7,
        "rag_top_k": 4,
        "similarity_threshold": 0.75,
        "confidence_threshold": 0.7,
        "rate_limit_per_minute": 60
    }'::jsonb
);

INSERT INTO automations (id, org_id, scope, enabled, fallback_message, escalation_rules) VALUES (
    '550e8400-e29b-41d4-a716-446655440010',
    '550e8400-e29b-41d4-a716-446655440001',
    'all',
    true,
    'I don''t know based on our documents. Would you like to connect to a human?',
    '[
        {"type": "low_confidence", "threshold": 0.7, "action": "escalate"},
        {"type": "no_retrieval", "action": "fallback"},
        {"type": "keyword", "keywords": ["human", "agent", "help", "speak to someone"], "action": "escalate"}
    ]'::jsonb
);

INSERT INTO customers (id, org_id, phone_number, name, order_count, tags, last_order_summary) VALUES (
    '550e8400-e29b-41d4-a716-446655440020',
    '550e8400-e29b-41d4-a716-446655440001',
    '+919876543210',
    'Test Customer',
    3,
    ARRAY['vip', 'repeat'],
    'Order #1234: 2x Widget Pro, delivered 2024-12-01'
);

-- Insert a sample KB document and chunks for testing
INSERT INTO kb_documents (id, org_id, title, source_url, file_type, status, chunk_count) VALUES (
    '550e8400-e29b-41d4-a716-446655440030',
    '550e8400-e29b-41d4-a716-446655440001',
    'Product FAQ',
    'https://democorp.com/faq',
    'html',
    'ready',
    3
);

INSERT INTO kb_chunks (id, document_id, org_id, chunk_index, chunk_text, metadata) VALUES
(
    '550e8400-e29b-41d4-a716-446655440031',
    '550e8400-e29b-41d4-a716-446655440030',
    '550e8400-e29b-41d4-a716-446655440001',
    0,
    'Widget Pro is our flagship product. It features a 10-inch display, 8GB RAM, and comes with a 2-year warranty. Price: $299. Available in Black, Silver, and Blue.',
    '{"section": "products", "title": "Widget Pro Specs"}'
),
(
    '550e8400-e29b-41d4-a716-446655440032',
    '550e8400-e29b-41d4-a716-446655440030',
    '550e8400-e29b-41d4-a716-446655440001',
    1,
    'Returns are accepted within 30 days of purchase. Items must be in original packaging. Refunds are processed within 5-7 business days. To initiate a return, contact support@democorp.com or call 1-800-DEMO.',
    '{"section": "returns", "title": "Return Policy"}'
),
(
    '550e8400-e29b-41d4-a716-446655440033',
    '550e8400-e29b-41d4-a716-446655440030',
    '550e8400-e29b-41d4-a716-446655440001',
    2,
    'Standard shipping takes 3-5 business days. Express shipping (next day) is available for $15. Free shipping on orders over $100. International shipping available to 50+ countries.',
    '{"section": "shipping", "title": "Shipping Information"}'
);
