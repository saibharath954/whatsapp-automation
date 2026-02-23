# Migration Guide: whatsapp-web.js → WhatsApp Cloud API (Meta)

## Overview

The MVP uses **[whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)** for WhatsApp Web integration. This is a reverse-engineered library that uses Puppeteer to control a WhatsApp Web browser instance. While functional for MVP, production systems should migrate to the official **WhatsApp Cloud API** for reliability, scalability, and compliance.

## Why Migrate?

| Factor | whatsapp-web.js | WhatsApp Cloud API |
|---|---|---|
| Official Support | ❌ Unofficial | ✅ Official Meta API |
| Stability | ⚠️ Can break on WA updates | ✅ Versioned, stable |
| Scalability | ❌ 1 Puppeteer per session | ✅ Serverless webhooks |
| Resource Usage | ⚠️ ~200MB RAM per session | ✅ Minimal (webhook) |
| Phone Requirement | Needs active phone | Uses Business Phone Number |
| Media Support | ✅ Full | ✅ Full |
| Rate Limits | WA internal limits | Documented API limits |
| Cost | Free | Meta pricing (per-conversation) |

## Architecture Diff

### Current (whatsapp-web.js)
```
Phone → WA Web → Puppeteer → whatsapp-web.js Client → Message Handler
```

### Target (Cloud API)
```
Phone → WA Servers → Webhook (POST /webhook) → Message Handler
```

## Migration Steps

### 1. Meta Business Setup
1. Create a [Meta Business Portfolio](https://business.facebook.com/)
2. Create a WhatsApp Business Account in the portfolio
3. Add a phone number and verify it
4. Generate a permanent access token
5. Configure your webhook URL

### 2. Implement Cloud API Transport

Replace `WhatsAppWebTransport` with a new `CloudAPITransport`:

```typescript
// backend/src/services/whatsapp/cloud-api.transport.ts
import { WhatsAppTransport, InboundWhatsAppMessage, SessionStatus } from '../../types';

export class CloudAPITransport implements WhatsAppTransport {
  private accessToken: string;
  private phoneNumberId: string;
  private status: SessionStatus = 'ready'; // Always ready with Cloud API

  constructor(config: { accessToken: string; phoneNumberId: string }) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
  }

  async initialize(): Promise<void> {
    // No initialization needed — webhook-based
    this.status = 'ready';
  }

  async sendMessage(to: string, text: string): Promise<void> {
    await fetch(
      `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );
  }

  // ... implement remaining WhatsAppTransport methods
}
```

### 3. Add Webhook Route

```typescript
// New route: POST /webhook
app.post('/webhook', async (req, reply) => {
  const body = req.body;
  // Verify webhook signature
  // Extract message from body.entry[0].changes[0].value.messages[0]
  // Call message handler
});

// Webhook verification (GET)
app.get('/webhook', async (req, reply) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return challenge;
  }
  reply.code(403);
});
```

### 4. Update Config

```env
# .env changes
WHATSAPP_TRANSPORT=cloud_api  # was: web_js
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token
```

### 5. Update Session Manager

The factory pattern in `createTransport()` already supports swapping:

```typescript
function createTransport(orgId: string, config: OrgConfig): WhatsAppTransport {
  if (config.transport === 'cloud_api') {
    return new CloudAPITransport({
      accessToken: config.cloudApiToken,
      phoneNumberId: config.phoneNumberId,
    });
  }
  return new WhatsAppWebTransport(orgId);
}
```

### 6. Remove Puppeteer Dependencies

After migration:
- Remove `whatsapp-web.js` from `package.json`
- Remove Chromium from Dockerfile
- Update K8s resource requests (much lower RAM needed)

## Timeline

| Phase | Duration | Tasks |
|---|---|---|
| Setup | 1 day | Meta Business account, phone verification |
| Implementation | 2-3 days | Cloud API transport, webhook, config |
| Testing | 2-3 days | End-to-end testing with test number |
| Migration | 1 day | Switch config, deploy, monitor |
| Cleanup | 1 day | Remove Puppeteer deps, update Dockerfiles |

## Resources

- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Webhooks Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Message Types](https://developers.facebook.com/docs/whatsapp/cloud-api/messages)
- [Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
