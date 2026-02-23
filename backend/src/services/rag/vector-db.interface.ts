import { VectorDocument, VectorSearchResult } from '../../types';

/**
 * Abstract Vector DB adapter interface.
 * Implement this for Redis Vector, Pinecone, Weaviate, etc.
 */
export interface VectorDBAdapter {
    readonly name: string;

    /**
     * Initialize the vector index for an org.
     */
    createIndex(orgId: string, dimensions: number): Promise<void>;

    /**
     * Insert or update documents in the vector store.
     */
    upsert(orgId: string, documents: VectorDocument[]): Promise<void>;

    /**
     * Perform similarity search.
     */
    search(orgId: string, embedding: number[], topK: number): Promise<VectorSearchResult[]>;

    /**
     * Delete documents by IDs.
     */
    delete(orgId: string, documentIds: string[]): Promise<void>;

    /**
     * Check health.
     */
    healthCheck(): Promise<boolean>;
}
