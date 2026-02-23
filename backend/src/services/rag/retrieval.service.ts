import { VectorDBAdapter } from './vector-db.interface';
import { EmbeddingProvider } from './embedding.interface';
import { VectorSearchResult, RetrievalResult } from '../../types';
import { query } from '../../db';
import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * RAG Retrieval Service.
 * Handles: query → embed → search → score → return top-K with confidence.
 */
export class RetrievalService {
    constructor(
        private vectorDB: VectorDBAdapter,
        private embedder: EmbeddingProvider,
    ) { }

    /**
     * Retrieve relevant KB chunks for a customer query.
     * Returns top-K results with metadata and an aggregate confidence score.
     */
    async retrieve(
        orgId: string,
        queryText: string,
        topK: number = config.ragTopK,
        similarityThreshold: number = config.ragSimilarityThreshold,
    ): Promise<{ results: RetrievalResult[]; aggregateConfidence: number }> {
        const startTime = Date.now();

        // 1. Embed the query
        const queryEmbedding = await this.embedder.embed(queryText);

        // 2. Search vector DB
        const vectorResults = await this.vectorDB.search(orgId, queryEmbedding, topK);

        // 3. Filter by similarity threshold
        const filtered = vectorResults.filter((r) => r.score >= similarityThreshold);

        // 4. Enrich with document metadata from Postgres
        const results = await this.enrichResults(orgId, filtered);

        // 5. Compute aggregate confidence
        const aggregateConfidence = this.computeAggregateConfidence(vectorResults, similarityThreshold);

        const latency = Date.now() - startTime;
        logger.info({
            orgId,
            queryLength: queryText.length,
            totalResults: vectorResults.length,
            filteredResults: filtered.length,
            aggregateConfidence,
            latency,
        }, 'RAG retrieval completed');

        return { results, aggregateConfidence };
    }

    /**
     * Enrich vector search results with document metadata from Postgres.
     */
    private async enrichResults(orgId: string, vectorResults: VectorSearchResult[]): Promise<RetrievalResult[]> {
        if (vectorResults.length === 0) return [];

        const docIds = vectorResults
            .map((r) => r.metadata.doc_id)
            .filter(Boolean);

        if (docIds.length === 0) {
            return vectorResults.map((r) => ({
                doc_id: String(r.metadata.doc_id || r.id),
                title: String(r.metadata.title || 'Unknown'),
                source_url: null,
                chunk_text: r.text,
                chunk_score: r.score,
            }));
        }

        // Fetch document metadata
        const docs = await query<{ id: string; title: string; source_url: string | null }>(
            `SELECT id, title, source_url FROM kb_documents WHERE org_id = $1 AND id = ANY($2)`,
            [orgId, docIds]
        );

        const docMap = new Map(docs.map((d) => [d.id, d]));

        return vectorResults.map((r) => {
            const doc = docMap.get(String(r.metadata.doc_id));
            return {
                doc_id: String(r.metadata.doc_id || r.id),
                title: doc?.title || String(r.metadata.title || 'Unknown'),
                source_url: doc?.source_url || null,
                chunk_text: r.text,
                chunk_score: r.score,
            };
        });
    }

    /**
     * Compute aggregate confidence from retrieval scores.
     * If the best score is below threshold, confidence is low.
     */
    private computeAggregateConfidence(
        results: VectorSearchResult[],
        threshold: number
    ): number {
        if (results.length === 0) return 0;

        const scores = results.map((r) => r.score);
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        // Weighted: 60% max score, 40% average
        const weighted = maxScore * 0.6 + avgScore * 0.4;

        // If max score below threshold, penalize sharply
        if (maxScore < threshold) {
            return weighted * 0.5;
        }

        return Math.min(weighted, 1.0);
    }
}
