import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import { config } from './config';
import { logger } from './utils/logger';

// Routes
import { adminRoutes } from './routes/admin.routes';
import { authRoutes } from './routes/auth.routes';
import { kbRoutes } from './routes/kb.routes';
import { automationRoutes } from './routes/automation.routes';
import { escalationRoutes } from './routes/escalation.routes';
import { conversationRoutes } from './routes/conversation.routes';
import { wsRoutes } from './routes/ws.routes';

// Services
import { SessionManager } from './services/whatsapp/session-manager';
import { MessagePipeline } from './services/whatsapp/message-pipeline';
import { ContextAssembler } from './services/context/context-assembler';
import { TokenBudgetManager } from './services/context/token-budget';
import { RetrievalService } from './services/rag/retrieval.service';
import { EscalationService } from './services/escalation/escalation.service';
import { IngestionService } from './services/kb/ingestion.service';
import { createLLMProvider } from './services/llm';
import { createVectorDBAdapter, createEmbeddingProvider } from './services/rag';

async function main() {
    const app = Fastify({
        logger: false, // We use pino directly
    });

    // ─── Plugins ───
    const frontendUrl = process.env.FRONTEND_URL; // e.g. 'https://whatsapp-automation-sigma.vercel.app'
    await app.register(cors, {
        origin: frontendUrl
            ? [frontendUrl, 'http://localhost:5173'] // production whitelist + local dev
            : true, // dev: allow all origins
        credentials: true,
    });
    await app.register(cookie);
    await app.register(websocket);

    // ─── Initialize Services ───
    logger.info('Initializing services...');

    const sessionManager = new SessionManager();
    const contextAssembler = new ContextAssembler();
    const tokenBudgetManager = new TokenBudgetManager();
    const escalationService = new EscalationService();

    // LLM & RAG — only initialize if API keys are available
    let llmProvider: any;
    let vectorDB: any;
    let embedder;
    let retrievalService;
    let ingestionService;
    let messagePipeline;

    try {
        llmProvider = createLLMProvider();
        vectorDB = createVectorDBAdapter();
        embedder = createEmbeddingProvider();
        retrievalService = new RetrievalService(vectorDB, embedder);
        ingestionService = new IngestionService(vectorDB, embedder);

        messagePipeline = new MessagePipeline(
            sessionManager,
            contextAssembler,
            tokenBudgetManager,
            retrievalService,
            llmProvider,
            escalationService,
        );

        logger.info({ llm: llmProvider.name, vectorDB: vectorDB.name }, 'AI services initialized');
    } catch (err) {
        logger.warn({ err }, 'AI services not fully configured — some features will be unavailable');
    }

    // ─── Decorate Fastify with services ───
    (app as any).sessionManager = sessionManager;
    (app as any).escalationService = escalationService;
    (app as any).retrievalService = retrievalService;
    (app as any).ingestionService = ingestionService;
    (app as any).messagePipeline = messagePipeline;

    // ─── Register Routes ───
    await app.register(authRoutes);
    await app.register(adminRoutes);
    await app.register(kbRoutes);
    await app.register(automationRoutes);
    await app.register(escalationRoutes);
    await app.register(conversationRoutes);
    await app.register(wsRoutes);

    // ─── Health Check ───
    app.get('/health', async () => {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            services: {
                llm: llmProvider?.name || 'not configured',
                vectorDB: vectorDB?.name || 'not configured',
                sessions: sessionManager.getActiveSessions().length,
            },
        };
    });

    // ─── Start Server ───
    try {
        await app.listen({ port: config.port, host: '0.0.0.0' });
        logger.info({ port: config.port, env: config.nodeEnv }, '🚀 WhatsApp Automation server started');
    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        process.exit(1);
    }

    // ─── Graceful Shutdown ───
    const shutdown = async () => {
        logger.info('Shutting down...');
        await app.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    logger.error({ err }, 'Fatal error');
    process.exit(1);
});
