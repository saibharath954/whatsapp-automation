import { v4 as uuid } from 'uuid';
import { query } from '../../db';
import { VectorDBAdapter } from '../rag/vector-db.interface';
import { EmbeddingProvider } from '../rag/embedding.interface';
import { KBDocument, KBChunk, VectorDocument } from '../../types';
import { logger } from '../../utils/logger';

// Chunk configuration
const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 100;

/**
 * Knowledge Base Ingestion Service.
 * Handles: parse document → chunk → embed → store in vector DB.
 */
export class IngestionService {
    constructor(
        private vectorDB: VectorDBAdapter,
        private embedder: EmbeddingProvider,
    ) { }

    /**
     * Ingest a text document into the KB.
     */
    async ingestText(params: {
        orgId: string;
        title: string;
        sourceUrl?: string;
        text: string;
        fileType: 'pdf' | 'html' | 'csv' | 'text';
    }): Promise<KBDocument> {
        const docId = uuid();
        const log = logger.child({ orgId: params.orgId, docId });

        try {
            // 1. Create document record
            const docRows = await query<KBDocument>(
                `INSERT INTO kb_documents (id, org_id, title, source_url, file_type, status)
         VALUES ($1, $2, $3, $4, $5, 'processing')
         RETURNING *`,
                [docId, params.orgId, params.title, params.sourceUrl || null, params.fileType]
            );

            // 2. Chunk the text
            const chunks = this.chunkText(params.text);
            log.info({ chunkCount: chunks.length }, 'Text chunked');

            // 3. Generate embeddings
            const embeddings = await this.embedder.embedBatch(chunks);

            // 4. Store chunks in Postgres
            for (let i = 0; i < chunks.length; i++) {
                const chunkId = uuid();
                await query(
                    `INSERT INTO kb_chunks (id, document_id, org_id, chunk_index, chunk_text, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
                    [chunkId, docId, params.orgId, i, chunks[i], JSON.stringify({ title: params.title })]
                );
            }

            // 5. Store embeddings in vector DB
            await this.vectorDB.createIndex(params.orgId, this.embedder.dimensions);

            const vectorDocs: VectorDocument[] = chunks.map((chunk, i) => ({
                id: `${docId}_${i}`,
                embedding: embeddings[i],
                text: chunk,
                metadata: {
                    doc_id: docId,
                    title: params.title,
                    chunk_index: i,
                },
            }));

            await this.vectorDB.upsert(params.orgId, vectorDocs);

            // 6. Update document status
            await query(
                `UPDATE kb_documents SET status = 'ready', chunk_count = $2, updated_at = NOW() WHERE id = $1`,
                [docId, chunks.length]
            );

            log.info({ chunkCount: chunks.length }, 'Document ingested successfully');
            return docRows[0];
        } catch (error) {
            log.error({ error }, 'Ingestion failed');
            await query(
                `UPDATE kb_documents SET status = 'error', updated_at = NOW() WHERE id = $1`,
                [docId]
            );
            throw error;
        }
    }

    /**
     * Delete a document from KB and vector store.
     */
    async deleteDocument(orgId: string, docId: string): Promise<void> {
        // Get chunk IDs for vector deletion
        const chunks = await query<{ id: string }>(
            `SELECT id FROM kb_chunks WHERE document_id = $1`,
            [docId]
        );

        // Delete from vector DB
        const vectorIds = chunks.map((_, i) => `${docId}_${i}`);
        if (vectorIds.length > 0) {
            await this.vectorDB.delete(orgId, vectorIds);
        }

        // Delete from Postgres (cascades to chunks)
        await query(`DELETE FROM kb_documents WHERE id = $1 AND org_id = $2`, [docId, orgId]);

        logger.info({ orgId, docId }, 'Document deleted');
    }

    /**
     * Chunk text with overlap.
     */
    private chunkText(text: string): string[] {
        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            const end = Math.min(start + CHUNK_SIZE, text.length);
            let chunkEnd = end;

            // Try to break at sentence boundary
            if (end < text.length) {
                const lastPeriod = text.lastIndexOf('.', end);
                const lastNewline = text.lastIndexOf('\n', end);
                const breakPoint = Math.max(lastPeriod, lastNewline);
                if (breakPoint > start + CHUNK_SIZE * 0.5) {
                    chunkEnd = breakPoint + 1;
                }
            }

            chunks.push(text.slice(start, chunkEnd).trim());
            start = chunkEnd - CHUNK_OVERLAP;
            if (start < 0) start = 0;
            if (chunkEnd >= text.length) break;
        }

        return chunks.filter((c) => c.length > 0);
    }
}
