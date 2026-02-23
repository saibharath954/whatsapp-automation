import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
    port: z.number().default(3000),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
    jwtSecret: z.string().min(8),

    // Database
    databaseUrl: z.string().url(),

    // Redis
    redisUrl: z.string().default('redis://localhost:6379'),

    // LLM
    llmProvider: z.enum(['gemini', 'openai', 'grok']).default('gemini'),
    geminiApiKey: z.string().optional(),
    geminiModel: z.string().default('gemini-2.0-flash'),
    openaiApiKey: z.string().optional(),
    openaiModel: z.string().default('gpt-4o'),

    // Embedding
    embeddingProvider: z.enum(['gemini', 'openai']).default('gemini'),
    openaiEmbeddingModel: z.string().default('text-embedding-3-small'),

    // Vector DB
    vectorDbProvider: z.enum(['redis', 'pinecone', 'weaviate']).default('redis'),

    // RAG
    ragTopK: z.number().default(4),
    ragSimilarityThreshold: z.number().default(0.75),
    llmConfidenceThreshold: z.number().default(0.7),
    contextMaxMessages: z.number().default(50),
    contextMaxDays: z.number().default(7),

    // Media
    mediaStorage: z.enum(['local', 's3']).default('local'),
    mediaLocalPath: z.string().default('./uploads/media'),
    s3Bucket: z.string().optional(),
    s3Region: z.string().optional(),

    // Security
    sessionEncryptionKey: z.string().default('default-dev-key-change-in-prod!!!!'),

    // Rate limiting
    rateLimitPerOrgPerMinute: z.number().default(60),
});

export type AppConfig = z.infer<typeof configSchema>;

function loadConfig(): AppConfig {
    return configSchema.parse({
        port: parseInt(process.env.PORT || '3000', 10),
        nodeEnv: process.env.NODE_ENV,
        jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
        databaseUrl: process.env.DATABASE_URL || 'postgresql://wa_user:wa_pass@localhost:5432/wa_automation',
        redisUrl: process.env.REDIS_URL,
        llmProvider: process.env.LLM_PROVIDER,
        geminiApiKey: process.env.GEMINI_API_KEY,
        geminiModel: process.env.GEMINI_MODEL,
        openaiApiKey: process.env.OPENAI_API_KEY,
        openaiModel: process.env.OPENAI_MODEL,
        embeddingProvider: process.env.EMBEDDING_PROVIDER,
        openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
        vectorDbProvider: process.env.VECTOR_DB_PROVIDER,
        ragTopK: parseInt(process.env.RAG_TOP_K || '4', 10),
        ragSimilarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.75'),
        llmConfidenceThreshold: parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD || '0.7'),
        contextMaxMessages: parseInt(process.env.CONTEXT_MAX_MESSAGES || '50', 10),
        contextMaxDays: parseInt(process.env.CONTEXT_MAX_DAYS || '7', 10),
        mediaStorage: process.env.MEDIA_STORAGE as 'local' | 's3',
        mediaLocalPath: process.env.MEDIA_LOCAL_PATH,
        s3Bucket: process.env.S3_BUCKET,
        s3Region: process.env.S3_REGION,
        sessionEncryptionKey: process.env.SESSION_ENCRYPTION_KEY,
        rateLimitPerOrgPerMinute: parseInt(process.env.RATE_LIMIT_PER_ORG_PER_MINUTE || '60', 10),
    });
}

export const config = loadConfig();
