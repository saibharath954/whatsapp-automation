import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import { LLMProvider } from './llm.interface';
import { LLMRequest, LLMResponse, LLMMessage } from '../../types';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export class GeminiAdapter implements LLMProvider {
    readonly name = 'gemini';
    private client: GoogleGenerativeAI;
    private model: GenerativeModel;

    constructor() {
        if (!config.geminiApiKey) {
            throw new Error('GEMINI_API_KEY is required for Gemini LLM provider');
        }
        this.client = new GoogleGenerativeAI(config.geminiApiKey);
        this.model = this.client.getGenerativeModel({ model: config.geminiModel });
    }

    async chat(request: LLMRequest): Promise<LLMResponse> {
        const startTime = Date.now();

        try {
            // Convert messages to Gemini format
            const systemInstruction = request.system_prompt;
            const contents = this.convertMessages(request.messages);

            const result = await this.model.generateContent({
                contents,
                systemInstruction,
                generationConfig: {
                    temperature: request.temperature ?? 0.2,
                    maxOutputTokens: request.max_tokens ?? 2048,
                },
            });

            const response = result.response;
            const text = response.text();
            const latency = Date.now() - startTime;

            logger.info({ provider: 'gemini', latency, model: config.geminiModel }, 'LLM call completed');

            // Parse confidence and citations from the response
            const confidence = this.parseConfidence(text);
            const citations = this.parseCitations(text);

            // Strip metadata lines (Confidence/Sources) from customer-facing text
            const cleanedText = this.stripResponseMetadata(text);

            // Estimate token usage (Gemini API provides this in some responses)
            const usage = {
                prompt_tokens: response.usageMetadata?.promptTokenCount ?? 0,
                completion_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
                total_tokens: response.usageMetadata?.totalTokenCount ?? 0,
            };

            return {
                content: cleanedText,
                confidence,
                citations,
                usage,
                raw_response: response,
            };
        } catch (error) {
            logger.error({ error, provider: 'gemini' }, 'Gemini LLM call failed');
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const result = await this.model.generateContent('Reply with OK');
            return !!result.response.text();
        } catch {
            return false;
        }
    }

    private convertMessages(messages: LLMMessage[]): Content[] {
        return messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));
    }

    /**
     * Parse confidence score from LLM response.
     * Expects the LLM to include "Confidence: X.XX" in its response.
     */
    private parseConfidence(text: string): number {
        const match = text.match(/Confidence:\s*([\d.]+)/i);
        if (match) {
            const val = parseFloat(match[1]);
            return val > 1 ? val / 100 : val; // Normalize 0-1
        }
        // Heuristic: check for uncertainty markers
        const uncertaintyMarkers = [
            'i\'m not sure',
            'i don\'t know',
            'i cannot find',
            'not enough information',
            'unclear',
            'i\'m unable to',
        ];
        const lowerText = text.toLowerCase();
        const hasUncertainty = uncertaintyMarkers.some((marker) => lowerText.includes(marker));
        return hasUncertainty ? 0.3 : 0.85;
    }

    /**
     * Parse citation references like [1], [2] from the response text.
     */
    private parseCitations(text: string): string[] {
        const matches = text.match(/\[(\d+)\]/g);
        if (!matches) return [];
        return [...new Set(matches)];
    }

    /**
     * Strip internal metadata (Sources, Confidence) from the customer-facing response.
     * The LLM is instructed to append these for parsing, but they should not be sent to customers.
     */
    private stripResponseMetadata(text: string): string {
        return text
            // Remove "Sources: [1], [2], ..." line (with optional leading pipe separator)
            .replace(/\|?\s*Sources:\s*\[[\d,\s\[\]]+\]/gi, '')
            // Remove "Confidence: 0.XX" line (with optional leading pipe separator)
            .replace(/\|?\s*Confidence:\s*[\d.]+/gi, '')
            .trim();
    }
}
