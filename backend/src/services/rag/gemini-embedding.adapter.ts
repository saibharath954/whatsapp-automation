import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmbeddingProvider } from './embedding.interface';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export class GeminiEmbeddingAdapter implements EmbeddingProvider {
    readonly name = 'gemini';
    readonly dimensions = 768; // text-embedding-004 dimensions
    private client: GoogleGenerativeAI;

    constructor() {
        if (!config.geminiApiKey) {
            throw new Error('GEMINI_API_KEY is required for Gemini embedding provider');
        }
        this.client = new GoogleGenerativeAI(config.geminiApiKey);
    }

    async embed(text: string): Promise<number[]> {
        const model = this.client.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await model.embedContent(text);
        return result.embedding.values;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        const model = this.client.getGenerativeModel({ model: 'text-embedding-004' });
        const results: number[][] = [];
        // Gemini embeddings API: process in batches
        for (const text of texts) {
            const result = await model.embedContent(text);
            results.push(result.embedding.values);
        }
        logger.info({ provider: 'gemini', count: texts.length }, 'Generated embeddings');
        return results;
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.embed('test');
            return true;
        } catch {
            return false;
        }
    }
}
