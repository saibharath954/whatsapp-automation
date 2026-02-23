import { FastifyInstance } from 'fastify';
import { query, queryOne } from '../db';
import { KBDocument } from '../types';

export async function kbRoutes(fastify: FastifyInstance) {
    // ─── Upload KB document (text) ───
    fastify.post<{
        Body: { orgId: string; title: string; sourceUrl?: string; text: string; fileType?: string };
    }>('/api/kb/upload', async (request, reply) => {
        const { orgId, title, sourceUrl, text, fileType } = request.body;

        const { ingestionService } = fastify as any;
        if (!ingestionService) {
            reply.code(503);
            return { error: 'Ingestion service not available' };
        }

        try {
            const doc = await ingestionService.ingestText({
                orgId,
                title,
                sourceUrl,
                text,
                fileType: fileType || 'text',
            });
            reply.code(201);
            return { document: doc };
        } catch (error: any) {
            reply.code(500);
            return { error: 'Ingestion failed', details: error.message };
        }
    });

    // ─── List KB documents for org ───
    fastify.get<{ Querystring: { orgId: string } }>('/api/kb/documents', async (request) => {
        const { orgId } = request.query;
        const docs = await query<KBDocument>(
            `SELECT * FROM kb_documents WHERE org_id = $1 ORDER BY created_at DESC`,
            [orgId]
        );
        return { documents: docs };
    });

    // ─── Get KB document details ───
    fastify.get<{ Params: { id: string } }>('/api/kb/documents/:id', async (request, reply) => {
        const doc = await queryOne<KBDocument>(
            `SELECT * FROM kb_documents WHERE id = $1`,
            [request.params.id]
        );
        if (!doc) {
            reply.code(404);
            return { error: 'Document not found' };
        }

        // Get chunks
        const chunks = await query(
            `SELECT id, chunk_index, chunk_text, metadata FROM kb_chunks WHERE document_id = $1 ORDER BY chunk_index`,
            [request.params.id]
        );

        return { document: doc, chunks };
    });

    // ─── Delete KB document ───
    fastify.delete<{ Params: { id: string }; Querystring: { orgId: string } }>(
        '/api/kb/documents/:id',
        async (request, reply) => {
            const { ingestionService } = fastify as any;
            try {
                await ingestionService.deleteDocument(request.query.orgId, request.params.id);
                return { success: true };
            } catch (error: any) {
                reply.code(500);
                return { error: 'Delete failed', details: error.message };
            }
        }
    );
}
