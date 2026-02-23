# WhatsApp Automation Service

A production-grade, multi-tenant WhatsApp automation service with RAG-powered responses, anti-hallucination safeguards, and operator escalation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Admin UI (React)                         │
│  Dashboard │ Sessions │ KB Upload │ Automations │ Escalations   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                     Fastify API Server                          │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ WhatsApp │  │  Context  │  │   RAG    │  │     LLM       │   │
│  │ Session  │→ │ Assembler │→ │ Pipeline │→ │   (Gemini)    │   │
│  │ Manager  │  │           │  │          │  │ Anti-halluc.  │   │
│  └─────────┘  └───────────┘  └──────────┘  └───────────────┘   │
│       │              │             │               │             │
│  ┌────▼────┐   ┌─────▼────┐  ┌────▼────┐   ┌─────▼──────┐     │
│  │whatsapp │   │ Postgres │  │  Redis  │   │ Escalation │     │
│  │-web.js  │   │    DB    │  │ Vector  │   │  Service   │     │
│  └─────────┘   └──────────┘  └─────────┘   └────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|---|---|
| Backend | Node.js + TypeScript + Fastify |
| Frontend | React + Vite + TypeScript |
| Database | PostgreSQL 16 |
| Cache / Vector DB | Redis Stack (RediSearch) |
| LLM | Gemini 2.0 Flash (default), OpenAI (alternative) |
| Embeddings | Gemini text-embedding-004 |
| WhatsApp | whatsapp-web.js (see [Cloud API migration](docs/cloud_api_migration.md)) |
| Infra | Docker, Kubernetes |
| CI | GitHub Actions |

## Quick Start (Docker Compose)

### Prerequisites
- Docker & Docker Compose
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Clone and configure

```bash
cd whatsapp-automation
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
```

### 2. Start services

```bash
docker-compose up -d
```

This starts:
- **Postgres** on port 5432 (auto-runs migration + seed data)
- **Redis Stack** on port 6379 (with RediSearch for vectors)
- **Backend** on port 3000
- **Frontend** on port 5173

### 3. Open the Admin UI

Navigate to [http://localhost:5173](http://localhost:5173)

### 4. Connect WhatsApp

1. Go to **Sessions** page
2. Click **Connect WhatsApp**
3. Scan the QR code with your phone (WhatsApp → ⋮ → Linked Devices)
4. Wait for "Connected" status

### 5. Upload Knowledge Base

1. Go to **Knowledge Base** page
2. Enter a title and paste your document content
3. Click **Upload & Ingest** — the system will chunk, embed, and index it

### 6. Test it!

Send a message from a test phone number to the connected WhatsApp. The system will:
1. Save the message
2. Search the KB for relevant information
3. Call Gemini with full context + anti-hallucination prompt
4. Reply with a grounded, cited answer
5. If confidence is low → send fallback + create escalation

## Local Development (without Docker)

```bash
# Backend
cd backend
npm install
cp ../.env.example ../.env  # Configure env vars
npm run dev                   # Starts on port 3000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                   # Starts on port 5173
```

You'll need Postgres and Redis running locally:
```bash
# Postgres
docker run -d --name wa-postgres -e POSTGRES_USER=wa_user -e POSTGRES_PASSWORD=wa_pass -e POSTGRES_DB=wa_automation -p 5432:5432 postgres:16-alpine

# Redis Stack
docker run -d --name wa-redis -p 6379:6379 redis/redis-stack:latest
```

Run migrations:
```bash
cd backend && psql "$DATABASE_URL" -f src/db/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f src/db/seed.sql
```

## Running Tests

```bash
cd backend
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## API Reference

### Admin
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/orgs` | List organizations |
| POST | `/api/admin/orgs` | Create organization |
| GET | `/api/admin/sessions` | List WhatsApp sessions |
| POST | `/api/admin/sessions/:orgId/connect` | Connect WhatsApp |
| DELETE | `/api/admin/sessions/:orgId` | Disconnect |

### Knowledge Base
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/kb/upload` | Upload & ingest document |
| GET | `/api/kb/documents?orgId=...` | List documents |
| DELETE | `/api/kb/documents/:id?orgId=...` | Delete document |

### Automations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/automations/:orgId` | Get automation config |
| PUT | `/api/automations/:orgId` | Update automation config |

### Escalations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/escalations?orgId=...` | List pending escalations |
| POST | `/api/escalations/:id/takeover` | Operator takeover |
| POST | `/api/escalations/:id/resolve` | Resolve escalation |

### Developer
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/conversations/:customerId/history` | Get chat history |
| POST | `/api/dev/rag-test` | Test RAG retrieval |

### WebSocket
| Endpoint | Description |
|---|---|
| `ws://host/ws/session/:orgId` | Live QR code + session status |

## Key Design Decisions

### Anti-Hallucination
- Strict system prompt forbids fabrication and requires citations
- Two-layer confidence check: retrieval similarity + LLM self-reported confidence
- Automatic fallback + escalation when confidence is low
- See [prompt_templates.md](docs/prompt_templates.md) for the exact prompts

### Context Assembly
Every LLM call includes the full context:
1. **Retrieval results** (KB chunks with scores)
2. **Conversation history** (last N messages or 7 days)
3. **Customer profile** (name, orders, tags)
4. **Session metadata** (business hours, status)
5. **Automation config** (scope, fallback)
6. **Previous bot answers** (with confirmation status)

Token budget manager applies priority trimming when context exceeds limits.

### WhatsApp Cloud API Migration
The current implementation uses whatsapp-web.js with a `WhatsAppTransport` interface that allows drop-in replacement. See [migration guide](docs/cloud_api_migration.md).

## Project Structure

```
whatsapp-automation/
├── backend/
│   └── src/
│       ├── config/          # Environment config (Zod validated)
│       ├── db/              # Postgres pool, migrations, seed
│       ├── services/
│       │   ├── whatsapp/    # Session manager, transport, message pipeline
│       │   ├── llm/         # LLM interface, Gemini/OpenAI adapters, prompt builder
│       │   ├── rag/         # Vector DB interface, Redis adapter, retrieval
│       │   ├── context/     # Context assembler, token budget manager
│       │   ├── escalation/  # Escalation service
│       │   └── kb/          # KB ingestion service
│       ├── routes/          # Fastify API routes
│       ├── types/           # TypeScript interfaces
│       ├── utils/           # Logger
│       └── __tests__/       # Unit + integration tests
├── frontend/
│   └── src/
│       ├── pages/           # Dashboard, Sessions, KB, Automations, Escalations, Chat
│       ├── App.tsx          # App shell with routing
│       └── index.css        # Dark theme with glassmorphism
├── infra/
│   ├── docker/              # Dockerfiles
│   └── k8s/                 # Kubernetes manifests
├── docs/
│   ├── prompt_templates.md  # Exact LLM prompts
│   └── cloud_api_migration.md
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## License

Private — All rights reserved.
