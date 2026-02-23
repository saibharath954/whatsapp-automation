import OpenAI from 'openai';
import { LLMProvider } from './llm.interface';
import { LLMRequest, LLMResponse } from '../../types';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export class OpenAIAdapter implements LLMProvider {
    readonly name = 'openai';
    private client: OpenAI;

    constructor() {
        if (!config.openaiApiKey) {
            throw new Error('OPENAI_API_KEY is required for OpenAI LLM provider');
        }
        this.client = new OpenAI({ apiKey: config.openaiApiKey });
    }

    async chat(request: LLMRequest): Promise<LLMResponse> {
        const startTime = Date.now();

        try {
            const messages: OpenAI.ChatCompletionMessageParam[] = [
                { role: 'system', content: request.system_prompt },
                ...request.messages.map((m) => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content,
                })),
            ];

            const completion = await this.client.chat.completions.create({
                model: config.openaiModel,
                messages,
                temperature: request.temperature ?? 0.2,
                max_tokens: request.max_tokens ?? 2048,
            });

            const text = completion.choices[0]?.message?.content || '';
            const latency = Date.now() - startTime;

            logger.info({ provider: 'openai', latency, model: config.openaiModel }, 'LLM call completed');

            const confidence = this.parseConfidence(text);
            const citations = this.parseCitations(text);

            return {
                content: text,
                confidence,
                citations,
                usage: {
                    prompt_tokens: completion.usage?.prompt_tokens ?? 0,
                    completion_tokens: completion.usage?.completion_tokens ?? 0,
                    total_tokens: completion.usage?.total_tokens ?? 0,
                },
                raw_response: completion,
            };
        } catch (error) {
            logger.error({ error, provider: 'openai' }, 'OpenAI LLM call failed');
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            const result = await this.client.chat.completions.create({
                model: config.openaiModel,
                messages: [{ role: 'user', content: 'Reply OK' }],
                max_tokens: 5,
            });
            return !!result.choices[0]?.message?.content;
        } catch {
            return false;
        }
    }

    private parseConfidence(text: string): number {
        const match = text.match(/Confidence:\s*([\d.]+)/i);
        if (match) {
            const val = parseFloat(match[1]);
            return val > 1 ? val / 100 : val;
        }
        const uncertaintyMarkers = ['i\'m not sure', 'i don\'t know', 'not enough information'];
        const lowerText = text.toLowerCase();
        return uncertaintyMarkers.some((m) => lowerText.includes(m)) ? 0.3 : 0.85;
    }

    private parseCitations(text: string): string[] {
        const matches = text.match(/\[(\d+)\]/g);
        return matches ? [...new Set(matches)] : [];
    }
}
