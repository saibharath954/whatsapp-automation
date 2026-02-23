/**
 * Abstract embedding provider interface.
 */
export interface EmbeddingProvider {
    readonly name: string;
    readonly dimensions: number;

    /**
     * Generate embedding for a single text input.
     */
    embed(text: string): Promise<number[]>;

    /**
     * Generate embeddings for multiple texts (batch).
     */
    embedBatch(texts: string[]): Promise<number[][]>;

    /**
     * Health check.
     */
    healthCheck(): Promise<boolean>;
}
