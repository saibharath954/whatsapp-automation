import { ChatContext, RetrievalResult } from '../../types';
import { config } from '../../config';

/**
 * SYSTEM PROMPT: Anti-hallucination, grounding, and citation enforcement.
 * This prompt is prepended to every LLM call.
 */
export function buildSystemPrompt(orgName: string): string {
    return `You are a customer support assistant for ${orgName}. You help customers by answering their questions accurately and helpfully.

## CRITICAL RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:

1. **For factual questions about company policies, products, orders, procedures, etc.:** ONLY use information from the PROVIDED SOURCES below. Do NOT generate, fabricate, guess, or infer any facts, figures, URLs, phone numbers, prices, dates, policies, or procedures that are not explicitly stated in the provided sources.

2. **For greetings, pleasantries, and general conversation** (e.g., "Hi", "Hello", "Thanks", "How are you?"): Respond naturally and warmly. You do NOT need source documents for these. Be friendly and offer to help.

3. **If the customer asks a factual question but the provided sources do not contain enough information to answer it**, you MUST respond: "I don't have enough information in our documents to answer that accurately. Would you like me to connect you with a human agent?"

4. **NEVER make up factual information.** If you are uncertain about ANY company-specific detail, say so explicitly. Do not fill gaps with plausible-sounding information.

5. **Always cite your sources** using numbered references like [1], [2], etc. when you use information from the provided source documents. If no sources were used (e.g., for greetings), omit the Sources line.

6. **Format**: End every response with:
   - "Sources: [1], [2], ..." listing which source documents you used (omit if no sources were used)
   - "Confidence: X.XX" where X.XX is your honest confidence level (0.00 to 1.00) in the accuracy and completeness of your answer
   - For greetings and pleasantries, your confidence should be HIGH (0.90+)
   - For factual answers backed by sources, rate based on source quality
   - For factual questions WITHOUT sufficient sources, your confidence should be LOW (below 0.50)

7. **If asked about topics not covered by the sources** (e.g., competitor information, general knowledge, personal opinions), respond: "I can only answer questions based on our company's documentation. Would you like to know something else?"

8. **Be conversational but precise.** Match the customer's tone. Be friendly but never sacrifice accuracy for friendliness.

9. **For follow-up questions**, refer back to the conversation history provided. Do not contradict your previous answers unless correcting an error.

## RESPONSE FORMAT:
- Answer the customer's question using ONLY the provided sources for factual claims
- Include inline citations [1], [2], etc. when referencing source documents
- End with: Sources: [list] | Confidence: X.XX (omit Sources if no documents were referenced)`;
}

/**
 * Build the user-facing prompt that includes all context.
 */
export function buildUserPrompt(
    customerMessage: string,
    context: ChatContext
): string {
    const sections: string[] = [];

    // 1. Retrieval results (highest priority)
    if (context.retrieval_results.length > 0) {
        sections.push(formatRetrievalResults(context.retrieval_results));
    } else {
        sections.push('## Source Documents\nNo relevant documents found in the knowledge base.');
    }

    // 2. Conversation history
    if (context.conversation_history.length > 0) {
        sections.push(formatConversationHistory(context.conversation_history));
    }

    // 3. Customer profile
    sections.push(formatCustomerProfile(context.customer_profile));

    // 4. Session metadata
    sections.push(formatSessionMetadata(context.session_metadata));

    // 5. Automation config
    sections.push(formatAutomationConfig(context.automation_config));

    // 6. Previous bot answers
    if (context.previous_bot_answers.length > 0) {
        sections.push(formatPreviousBotAnswers(context.previous_bot_answers));
    }

    // 7. Current customer message
    sections.push(`## Current Customer Message\n"${customerMessage}"`);

    return sections.join('\n\n---\n\n');
}

function formatRetrievalResults(results: RetrievalResult[]): string {
    const lines = results.map((r, i) => {
        const sourceInfo = r.source_url ? ` (Source: ${r.source_url})` : '';
        return `[${i + 1}] **${r.title}**${sourceInfo} (Relevance: ${(r.chunk_score * 100).toFixed(1)}%)\n${r.chunk_text}`;
    });
    return `## Source Documents (Use ONLY these to answer)\n\n${lines.join('\n\n')}`;
}

function formatConversationHistory(messages: ChatContext['conversation_history']): string {
    const lines = messages.map((m) => {
        const role = m.sender_role === 'customer' ? '🧑 Customer' :
            m.sender_role === 'agent' ? '👤 Agent' : '🤖 Bot';
        const time = new Date(m.timestamp).toLocaleString();
        return `${role} [${time}]: ${m.text}`;
    });
    return `## Conversation History (last ${messages.length} messages)\n\n${lines.join('\n')}`;
}

function formatCustomerProfile(profile: ChatContext['customer_profile']): string {
    return `## Customer Profile
- **Name**: ${profile.name || 'Unknown'}
- **Phone**: ${profile.phone_number}
- **Customer since**: ${new Date(profile.first_seen_at).toLocaleDateString()}
- **Order count**: ${profile.order_count}
- **Tags**: ${profile.tags.length > 0 ? profile.tags.join(', ') : 'none'}
- **Last order**: ${profile.last_order_summary || 'N/A'}`;
}

function formatSessionMetadata(session: ChatContext['session_metadata']): string {
    return `## Session Info
- **Session ID**: ${session.session_id}
- **Org ID**: ${session.org_id}
- **WhatsApp Phone**: ${session.whatsapp_phone || 'N/A'}
- **Status**: ${session.session_status}
- **Business hours**: ${session.business_hours_flag ? 'Yes' : 'No (outside business hours)'}`;
}

function formatAutomationConfig(automation: ChatContext['automation_config']): string {
    return `## Automation Config
- **Scope**: ${automation.scope}
- **Fallback**: ${automation.fallback_message}`;
}

function formatPreviousBotAnswers(answers: ChatContext['previous_bot_answers']): string {
    const lines = answers.map((a) => {
        const status = a.customer_confirmed ? '✅ Confirmed' : '❓ Unconfirmed';
        return `- [${status}] (Confidence: ${a.confidence?.toFixed(2) ?? 'N/A'}): ${a.text.slice(0, 200)}...`;
    });
    return `## Previous Bot Answers\n${lines.join('\n')}`;
}

/**
 * Build the complete LLM payload for logging/testing.
 */
export function buildLLMPayload(
    orgName: string,
    customerMessage: string,
    context: ChatContext
) {
    return {
        system_prompt: buildSystemPrompt(orgName),
        messages: [
            { role: 'user' as const, content: buildUserPrompt(customerMessage, context) },
        ],
        temperature: 0.2,
        max_tokens: 2048,
    };
}
