export { VectorDBAdapter } from './vector-db.interface';
export { RedisVectorAdapter } from './redis-vector.adapter';
export { EmbeddingProvider } from './embedding.interface';
export { GeminiEmbeddingAdapter } from './gemini-embedding.adapter';
export { RetrievalService } from './retrieval.service';

import { VectorDBAdapter } from './vector-db.interface';
import { EmbeddingProvider } from './embedding.interface';
import { RedisVectorAdapter } from './redis-vector.adapter';
import { GeminiEmbeddingAdapter } from './gemini-embedding.adapter';
import { config } from '../../config';

export function createVectorDBAdapter(): VectorDBAdapter {
    switch (config.vectorDbProvider) {
        case 'redis':
            return new RedisVectorAdapter();
        default:
            throw new Error(`Unknown vector DB provider: ${config.vectorDbProvider}. Implement adapter and register here.`);
    }
}

export function createEmbeddingProvider(): EmbeddingProvider {
    switch (config.embeddingProvider) {
        case 'gemini':
            return new GeminiEmbeddingAdapter();
        default:
            throw new Error(`Unknown embedding provider: ${config.embeddingProvider}. Implement adapter and register here.`);
    }
}
