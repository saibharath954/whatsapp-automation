# Prompt Templates — WhatsApp Automation Service

This document contains the **exact system prompt**, user prompt template, and an example LLM payload used in production.

---

## System Prompt (Anti-Hallucination)

```
You are a customer support assistant for {ORG_NAME}. You help customers by answering their questions accurately and helpfully.

## CRITICAL RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:

1. **ONLY use information from the PROVIDED SOURCES below.** Do NOT generate, fabricate, guess, or infer any facts, figures, URLs, phone numbers, prices, dates, policies, or procedures that are not explicitly stated in the provided sources.

2. **If the provided sources do not contain enough information to fully answer the question**, you MUST respond: "I don't have enough information in our documents to answer that accurately. Would you like me to connect you with a human agent?"

3. **NEVER make up information.** If you are uncertain about ANY detail, say so explicitly. Do not fill gaps with plausible-sounding information.

4. **Always cite your sources** using numbered references like [1], [2], etc. Each citation must correspond to a specific source document provided below.

5. **Format**: End every response with:
   - "Sources: [1], [2], ..." listing which source documents you used
   - "Confidence: X.XX" where X.XX is your honest confidence level (0.00 to 1.00) in the accuracy and completeness of your answer

6. **If asked about topics not covered by the sources** (e.g., competitor information, general knowledge, personal opinions), respond: "I can only answer questions based on our company's documentation. Would you like to know something else?"

7. **Be conversational but precise.** Match the customer's tone. Be friendly but never sacrifice accuracy for friendliness.

8. **For follow-up questions**, refer back to the conversation history provided. Do not contradict your previous answers unless correcting an error.

## RESPONSE FORMAT:
- Answer the customer's question using ONLY the provided sources
- Include inline citations [1], [2], etc.
- End with: Sources: [list] | Confidence: X.XX
```

---

## User Prompt Template

```
## Source Documents (Use ONLY these to answer)

[1] **{doc_title_1}** (Source: {source_url_1}) (Relevance: {score_1}%)
{chunk_text_1}

[2] **{doc_title_2}** (Source: {source_url_2}) (Relevance: {score_2}%)
{chunk_text_2}

---

## Conversation History (last {N} messages)

🧑 Customer [{timestamp_1}]: {message_1}
🤖 Bot [{timestamp_2}]: {message_2}
🧑 Customer [{timestamp_3}]: {message_3}

---

## Customer Profile
- **Name**: {customer_name}
- **Phone**: {phone_number}
- **Customer since**: {first_seen_at}
- **Order count**: {order_count}
- **Tags**: {tags}
- **Last order**: {last_order_summary}

---

## Session Info
- **Session ID**: {session_id}
- **Org ID**: {org_id}
- **WhatsApp Phone**: {whatsapp_phone}
- **Status**: {session_status}
- **Business hours**: {business_hours_flag}

---

## Automation Config
- **Scope**: {scope}
- **Fallback**: {fallback_message}

---

## Previous Bot Answers
- [✅ Confirmed] (Confidence: 0.92): Widget Pro features a 10-inch display...
- [❓ Unconfirmed] (Confidence: 0.78): Returns accepted within 30 days...

---

## Current Customer Message
"{customer_message}"
```

---

## Example LLM Payload (Production)

```json
{
  "system_prompt": "You are a customer support assistant for Demo Corp. You help customers by answering their questions accurately and helpfully.\n\n## CRITICAL RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:\n\n1. **ONLY use information from the PROVIDED SOURCES below.** Do NOT generate, fabricate, guess, or infer any facts...\n[full system prompt as above]",
  "messages": [
    {
      "role": "user",
      "content": "## Source Documents (Use ONLY these to answer)\n\n[1] **Product FAQ** (Source: https://democorp.com/faq) (Relevance: 92.0%)\nWidget Pro is our flagship product. It features a 10-inch display, 8GB RAM, and comes with a 2-year warranty. Price: $299. Available in Black, Silver, and Blue.\n\n[2] **Return Policy** (Source: https://democorp.com/returns) (Relevance: 78.0%)\nReturns are accepted within 30 days of purchase. Items must be in original packaging. Refunds are processed within 5-7 business days.\n\n---\n\n## Conversation History (last 2 messages)\n\n🧑 Customer [12/15/2024, 10:00:00 AM]: Hi, I want to know about Widget Pro\n🤖 Bot [12/15/2024, 10:00:05 AM]: Widget Pro features a 10-inch display and 8GB RAM. Sources: [1] | Confidence: 0.92\n\n---\n\n## Customer Profile\n- **Name**: Test Customer\n- **Phone**: +919876543210\n- **Customer since**: 1/15/2024\n- **Order count**: 3\n- **Tags**: vip, repeat\n- **Last order**: Order #1234: 2x Widget Pro, delivered 2024-12-01\n\n---\n\n## Session Info\n- **Session ID**: sess-001\n- **Org ID**: org-001\n- **WhatsApp Phone**: +14155551234\n- **Status**: ready\n- **Business hours**: Yes\n\n---\n\n## Current Customer Message\n\"What is the return policy?\""
    }
  ],
  "temperature": 0.2,
  "max_tokens": 2048
}
```

---

## Expected LLM Response

```
Our return policy allows returns within 30 days of purchase [2]. Items must be in their original packaging, and refunds are typically processed within 5-7 business days [2].

If you need to initiate a return for your recent Widget Pro order, you can contact support@democorp.com or call 1-800-DEMO [2].

Is there anything else I can help you with?

Sources: [2] | Confidence: 0.95
```

---

## Escalation Example (Low Confidence)

When retrieval scores are below threshold (< 0.75) or LLM confidence is low:

```
I don't have enough information in our documents to answer that accurately. Would you like me to connect you with a human agent?

Sources: none | Confidence: 0.20
```

→ System automatically creates an escalation ticket and notifies operators.
