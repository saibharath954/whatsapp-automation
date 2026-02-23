import { LLMRequest, LLMResponse } from '../../types';

/**
 * Abstract LLM provider interface.
 * Implement this for each LLM backend (Gemini, OpenAI, Grok).
 */
export interface LLMProvider {
    readonly name: string;

    /**
     * Send a chat completion request to the LLM.
     */
    chat(request: LLMRequest): Promise<LLMResponse>;

    /**
     * Check provider health / connectivity.
     */
    healthCheck(): Promise<boolean>;
}
