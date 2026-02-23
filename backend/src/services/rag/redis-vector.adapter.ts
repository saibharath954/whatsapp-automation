import { createClient, RedisClientType } from 'redis';
import { VectorDBAdapter } from './vector-db.interface';
import { VectorDocument, VectorSearchResult } from '../../types';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Redis Vector adapter using RediSearch FT.CREATE / FT.SEARCH.
 * Stores embeddings as VECTOR fields and supports KNN similarity search.
 */
export class RedisVectorAdapter implements VectorDBAdapter {
    readonly name = 'redis';
    private client: RedisClientType;
    private connected = false;

    constructor() {
        this.client = createClient({ url: config.redisUrl }) as RedisClientType;
    }

    private async ensureConnected(): Promise<void> {
        if (!this.connected) {
            await this.client.connect();
            this.connected = true;
        }
    }

    async createIndex(orgId: string, dimensions: number): Promise<void> {
        await this.ensureConnected();
        const indexName = this.indexName(orgId);

        try {
            // Check if index exists
            await this.client.ft.info(indexName);
            logger.info({ orgId, indexName }, 'Vector index already exists');
        } catch {
            // Create the index
            await this.client.ft.create(
                indexName,
                {
                    '$.text': { type: 'TEXT', AS: 'text' },
                    '$.doc_id': { type: 'TAG', AS: 'doc_id' },
                    '$.title': { type: 'TEXT', AS: 'title' },
                    '$.embedding': {
                        type: 'VECTOR',
                        AS: 'embedding',
                        ALGORITHM: 'HNSW',
                        TYPE: 'FLOAT32',
                        DIM: dimensions,
                        DISTANCE_METRIC: 'COSINE',
                    },
                },
                { ON: 'JSON', PREFIX: this.keyPrefix(orgId) }
            );
            logger.info({ orgId, indexName, dimensions }, 'Created vector index');
        }
    }

    async upsert(orgId: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureConnected();

        for (const doc of documents) {
            const key = `${this.keyPrefix(orgId)}${doc.id}`;
            await this.client.json.set(key, '$', {
                id: doc.id,
                text: doc.text,
                embedding: doc.embedding,
                ...doc.metadata,
            });
        }
        logger.info({ orgId, count: documents.length }, 'Upserted vectors');
    }

    async search(orgId: string, embedding: number[], topK: number): Promise<VectorSearchResult[]> {
        await this.ensureConnected();
        const indexName = this.indexName(orgId);

        try {
            // Convert embedding to Buffer for RediSearch KNN query
            const blob = Buffer.from(new Float32Array(embedding).buffer);

            const results = await this.client.ft.search(
                indexName,
                `*=>[KNN ${topK} @embedding $query_vec AS score]`,
                {
                    PARAMS: { query_vec: blob },
                    SORTBY: { BY: 'score', DIRECTION: 'ASC' },
                    LIMIT: { from: 0, size: topK },
                    DIALECT: 2,
                    RETURN: ['text', 'doc_id', 'title', 'score'],
                }
            );

            return results.documents.map((doc) => ({
                id: doc.id.replace(this.keyPrefix(orgId), ''),
                score: 1 - parseFloat(String(doc.value?.score || '1')), // cosine distance → similarity
                text: String(doc.value?.text || ''),
                metadata: {
                    doc_id: String(doc.value?.doc_id || ''),
                    title: String(doc.value?.title || ''),
                },
            }));
        } catch (error) {
            logger.error({ error, orgId }, 'Vector search failed');
            return [];
        }
    }

    async delete(orgId: string, documentIds: string[]): Promise<void> {
        await this.ensureConnected();
        for (const id of documentIds) {
            const key = `${this.keyPrefix(orgId)}${id}`;
            await this.client.json.del(key);
        }
        logger.info({ orgId, count: documentIds.length }, 'Deleted vectors');
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.ensureConnected();
            await this.client.ping();
            return true;
        } catch {
            return false;
        }
    }

    private indexName(orgId: string): string {
        return `idx:kb:${orgId}`;
    }

    private keyPrefix(orgId: string): string {
        return `kb:${orgId}:`;
    }
}
