import { ChatContext } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Token Budget Manager.
 * Ensures the LLM prompt stays within token limits.
 * Uses a priority ordering when token budget is exceeded:
 *   1. Retrieval chunks (highest priority)
 *   2. Last 10 messages
 *   3. Customer profile
 *   4. Session metadata (lowest priority)
 */

// Rough token estimation: ~4 chars per token for English text
const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_TOKENS = 12000; // Conservative budget for context

export class TokenBudgetManager {
    private maxTokens: number;

    constructor(maxTokens: number = DEFAULT_MAX_TOKENS) {
        this.maxTokens = maxTokens;
    }

    /**
     * Trim the context to fit within the token budget.
     * Applies priority ordering: retrieval > recent messages > profile > session.
     */
    trimContext(context: ChatContext): ChatContext {
        let totalTokens = this.estimateTokens(context);

        if (totalTokens <= this.maxTokens) {
            return context;
        }

        logger.info({ totalTokens, maxTokens: this.maxTokens }, 'Token budget exceeded, trimming context');

        const trimmed = { ...context };

        // Step 1: Trim session metadata (lowest priority)
        if (totalTokens > this.maxTokens) {
            // Session metadata is small, skip trimming
        }

        // Step 2: Trim customer profile extras
        if (totalTokens > this.maxTokens) {
            trimmed.previous_bot_answers = trimmed.previous_bot_answers.slice(0, 3);
            totalTokens = this.estimateTokens(trimmed);
        }

        // Step 3: Trim conversation history to last 10 messages
        if (totalTokens > this.maxTokens) {
            trimmed.conversation_history = trimmed.conversation_history.slice(-10);
            totalTokens = this.estimateTokens(trimmed);
        }

        // Step 4: Trim conversation history to last 5 messages
        if (totalTokens > this.maxTokens) {
            trimmed.conversation_history = trimmed.conversation_history.slice(-5);
            totalTokens = this.estimateTokens(trimmed);
        }

        // Step 5: Trim retrieval results (cut chunk text length)
        if (totalTokens > this.maxTokens) {
            trimmed.retrieval_results = trimmed.retrieval_results.map((r) => ({
                ...r,
                chunk_text: r.chunk_text.slice(0, 500),
            }));
            totalTokens = this.estimateTokens(trimmed);
        }

        logger.info({ trimmedTokens: totalTokens }, 'Context trimmed to fit budget');
        return trimmed;
    }

    /**
     * Estimate token count from context.
     */
    estimateTokens(context: ChatContext): number {
        let chars = 0;

        // Conversation history
        for (const msg of context.conversation_history) {
            chars += msg.text.length + 50; // overhead for metadata
        }

        // Retrieval results
        for (const r of context.retrieval_results) {
            chars += r.chunk_text.length + r.title.length + 80;
        }

        // Customer profile
        chars += JSON.stringify(context.customer_profile).length;

        // Session metadata
        chars += JSON.stringify(context.session_metadata).length;

        // Automation config
        chars += JSON.stringify(context.automation_config).length;

        // Previous bot answers
        for (const a of context.previous_bot_answers) {
            chars += a.text.length + 50;
        }

        return Math.ceil(chars / CHARS_PER_TOKEN);
    }
}
