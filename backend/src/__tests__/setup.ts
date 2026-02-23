// Test setup: mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.JWT_SECRET = 'test-secret-key-12345';
process.env.DATABASE_URL = 'postgresql://wa_user:wa_pass@localhost:5432/wa_automation_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.LLM_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.EMBEDDING_PROVIDER = 'gemini';
process.env.VECTOR_DB_PROVIDER = 'redis';
