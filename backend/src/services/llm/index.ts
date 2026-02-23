import { LLMProvider } from './llm.interface';
import { GeminiAdapter } from './gemini.adapter';
import { OpenAIAdapter } from './openai.adapter';
import { config } from '../../config';

export { LLMProvider } from './llm.interface';
export { GeminiAdapter } from './gemini.adapter';
export { OpenAIAdapter } from './openai.adapter';
export { buildSystemPrompt, buildUserPrompt, buildLLMPayload } from './prompt-builder';

/**
 * Factory: create the configured LLM provider.
 */
export function createLLMProvider(): LLMProvider {
    switch (config.llmProvider) {
        case 'gemini':
            return new GeminiAdapter();
        case 'openai':
            return new OpenAIAdapter();
        case 'grok':
            // Grok uses OpenAI-compatible API
            return new OpenAIAdapter();
        default:
            throw new Error(`Unknown LLM provider: ${config.llmProvider}`);
    }
}
