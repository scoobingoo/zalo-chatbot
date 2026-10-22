# 💬 ZaloFlow Studio

> **Omnichannel Zalo Live-Chat Workspace, Customer CRM, Multi-Provider AI Agent & Model Context Protocol (MCP) Gateway**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![AI Providers](https://img.shields.io/badge/AI-Gemini%20%7C%20OpenAI%20%7C%20ChatGPT-6366f1)](#2-autonomous-multi-provider-ai-agent-studio)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP%20%2B%20OAuth%202.1-2563eb)](#3-model-context-protocol-mcp-gateway)
[![Version](https://img.shields.io/badge/version-2.0.0-10b981)](CHANGELOG.md)

**ZaloFlow Studio** is a self-hosted, single-channel Zalo CRM workspace and AI automation platform engineered for high reliability, zero external database dependencies, and seamless integration with modern LLM ecosystems. It combines a real-time 3-column customer support inbox, an autonomous multi-provider AI agent, a RESTful integration API, and a standards-compliant **Model Context Protocol (MCP)** server into a single lightweight Node.js + SQLite deployment.

---

## ✨ Key Highlights

### 1. 🖥️ 3-Column Omnichannel Inbox & Customer CRM
- **Real-Time Server-Sent Events (SSE):** Instant message delivery, read status updates, and AI state synchronization via `/app/events` without heavyweight WebSocket polling.
- **Persistent QR Session Recovery:** Scan once from the Zalo mobile app; session credentials (`cookie`, `imei`, `userAgent`) are persisted in SQLite and automatically restored across server restarts.
- **Built-in Customer CRM Inspector:** Tag conversations (`VIP`, `Lead`, `Support`, `Follow-up`, `Done`), filter threads by tag or unread status, and maintain persistent internal customer notes right alongside the chat pane.
- **Slash-Command Quick Replies:** Create reusable canned responses (`/chao`, `/baogia`, `/sdt`) and expand them inline with `Space` or `Tab` or via one-click pills.
- **Modern SaaS UI with Dark & Light Modes:** Crafted with an Indigo/Electric-Blue design system, glassmorphism accents, responsive mobile drawers, and live KPI telemetry pills.

### 2. 🤖 Autonomous Multi-Provider AI Agent Studio
- **Multi-LLM Support & Automatic Failover:**
  - **Google Gemini** (Native REST API + Imagen image generation)
  - **OpenAI** (`gpt-4.1`, `gpt-4o`, `o3-mini`, etc.)
  - **OpenAI-Compatible Endpoints** (OpenRouter, DeepSeek, Groq, Together AI)
  - **ChatGPT Plus / Pro Subscription** (OAuth PKCE flow with encrypted token refresh)
  - Configure a **Primary Chat Provider**, an automatic **Fallback Provider**, and a dedicated **Image Generation Provider**.
- **AES-256-GCM Secret Encryption:** All API keys and OAuth tokens are encrypted at rest in SQLite using `src/services/ai/secrets.js` and masked in all API responses and logs.
- **Smart Human-in-the-Loop Coexistence:**
  - **Auto-Pause on Human Reply:** When an operator replies from the Web UI or the mobile Zalo app, the AI automatically pauses for that thread (configurable duration, e.g., 30 minutes).
  - **In-Chat Commands:** Channel owners can toggle AI per thread from their phone (`/ai on`, `/ai off`); customers can reset conversation context (`/new`).
  - **Granular Scope Policies:** Control AI behavior across Direct Messages (`all`, `non_contacts`, `contacts`, `off`), Groups (`mention`/reply-only vs. `all` + group whitelist), and active business hours (`Asia/Ho_Chi_Minh`).
- **Multimodal Vision & Function Calling:**
  - **Vision:** Reads customer-sent photos (with strict CDN host allowlisting to prevent SSRF).
  - **Built-in Tools:** `get_current_time`, `handoff_to_human` (flags thread with 🙋 and alerts staff via SSE), and `generate_image`.
- **Interactive Simulator Playground:** Test system prompts, vision inputs, and tool calls directly inside `/ai.html` without sending real messages to Zalo.

### 3. 🔌 Model Context Protocol (MCP) Gateway
- **Streamable HTTP Endpoint (`/mcp`):** Connect external AI clients (Claude, ChatGPT, Cursor, custom agents) directly to your Zalo channel.
- **OAuth 2.1 with Dynamic Client Registration (DCR) & PKCE:** Full authorization server implementation (`/authorize`, `/token`, `/register`, `/.well-known/oauth-authorization-server`) backed by hashed tokens and granular scopes (`zalo:read`, `zalo:send`).
- **Rate-Limited & Audited Execution:** Built-in send pacing, idempotency keys, and real-time connection revocation in the Settings dashboard.

### 4. 🚀 External REST API (`/api/v1`)
- Manage multiple `X-API-Key` credentials (`zik_...`) from the Web UI.
- Send text and images by `thread_id` (auto-detecting individual vs. group threads) or directly by phone number (`/api/v1/send-phone`).

---

## 🏗️ System Architecture

```mermaid
flowchart LR
    subgraph Clients["External Clients & Operators"]
        WebUI["🖥️ Web Workspace\n(Inbox, CRM, AI Studio)"]
        MCPClient["🤖 AI Clients\n(Claude / ChatGPT MCP)"]
        RestClient["⚙️ External CRM / ERP\n(REST API X-API-Key)"]
    end

    subgraph Server["ZaloFlow Studio (Node.js + Express)"]
        SSE["⚡ SSE Hub\n(/app/events)"]
        WebRoutes["🔐 Web & CRM Routes\n(/app/*)"]
        ApiRoutes["🔑 REST API v1\n(/api/v1/*)"]
        McpServer["🛡️ MCP + OAuth 2.1\n(/mcp)"]
        AIEngine["🧠 AI Agent Engine\n(Policy, Context, Tools)"]
        ZaloSvc["📱 ZaloChannel Singleton\n(zca-js + Echo Dedupe)"]
    end

    subgraph Storage["Local Persistence"]
        SQLite[("🗄️ SQLite (WAL)\ndata/inbox.db")]
        Secrets["🔒 AES-256-GCM\nEncrypted Secrets"]
    end

    subgraph Cloud["External Services"]
        ZaloNet["☁️ Zalo WebSocket & CDN"]
        LLMs["✨ LLM Providers\n(Gemini / OpenAI / OpenRouter)"]
    end

    WebUI <-->|"Cookie Auth + SSE"| WebRoutes
    WebUI <-- "Realtime Events" --- SSE
    MCPClient <-->|"OAuth 2.1 PKCE"| McpServer
    RestClient <-->|"X-API-Key"| ApiRoutes

    WebRoutes --> ZaloSvc
    ApiRoutes --> ZaloSvc
    McpServer --> ZaloSvc
    ZaloSvc <-->|"WebSocket Listener"| ZaloNet
    ZaloSvc -->|"ai_incoming / ai_human_reply"| AIEngine
    AIEngine -->|"Auto-Reply"| ZaloSvc
    AIEngine <-->|"Native Fetch"| LLMs

    WebRoutes --> SQLite
    ZaloSvc --> SQLite
    AIEngine --> SQLite
    AIEngine --> Secrets
    McpServer --> SQLite
```

### Message Deduplication & Race-Condition Protection
When sending messages from the server (Web UI, REST API, MCP, or AI Agent), Zalo's WebSocket listener (`selfListen: true`) emits a self-echo event (`isSelf = true`). Because the WebSocket echo can occasionally arrive **before** the HTTP `sendMessage()` promise resolves, `ZaloChannel` registers sent IDs immediately and applies a **1.5-second re-verification buffer** on incoming `isSelf` events. This prevents server-sent AI/API messages from being misclassified as manual phone replies and accidentally triggering the human auto-pause timer.

---

## 📂 Project Structure

```text
zalo-chatbot/
├── src/
│   ├── server.js                 # Express entry point, SSE wiring, admin seeding, Zalo restore
│   ├── config.js                 # Environment configuration loader
│   ├── db.js                     # SQLite (better-sqlite3) schema, auto-migrations & repositories
│   ├── middleware/
│   │   ├── webAuth.js            # Cookie token authentication for Web UI
│   │   └── apiAuth.js            # X-API-Key authentication for REST API v1
│   ├── routes/
│   │   ├── web.js                # /app/* routes (auth, QR, threads, CRM, quick replies, stats)
│   │   ├── ai.js                 # /app/ai/* routes (providers, settings, playground, logs)
│   │   └── api.js                # /api/v1/* external REST API endpoints
│   ├── mcp/
│   │   ├── index.js              # MCP Streamable HTTP server & OAuth 2.1 endpoints
│   │   ├── auth.js               # OAuth DCR, PKCE, token hashing & consent UI
│   │   ├── tools.js              # MCP tools (list contacts/groups, search, send message)
│   │   └── store.js              # SQLite persistence for MCP clients, tokens & audit log
│   └── services/
│       ├── zaloService.js        # Singleton ZaloChannel (QR login, listener, send, contact sync)
│       ├── sse.js                # Server-Sent Events broadcast hub
│       ├── logger.js             # Daily rotating channel logger
│       └── ai/                   # Autonomous AI Agent subsystem
│           ├── engine.js         # Debounce queue, concurrency limiter, fallback orchestrator
│           ├── policy.js         # Multi-layer scope & active-hours evaluation
│           ├── agent.js          # Multi-round tool-calling loop
│           ├── context.js        # Conversation history builder & prompt assembler
│           ├── secrets.js        # AES-256-GCM encryption & secret masking
│           ├── providers/        # Native-fetch adapters (Gemini, OpenAI, Compat, ChatGPT OAuth)
│           └── tools/            # Agent tools (current time, human handoff, image generation)
├── public/                       # Frontend SPA assets (Light/Dark SaaS UI)
│   ├── login.html                # Split-screen SaaS login page
│   ├── index.html                # 3-column Omnichannel Inbox & CRM Workspace
│   ├── ai.html                   # AI Agent Studio & Simulator Playground
│   ├── settings.html             # Channel status, MCP OAuth manager & API Explorer
│   ├── css/                      # Design system (app.css, mcp.css)
│   └── js/                       # Frontend controllers (app.js, ai.js, settings.js)
└── test/                         # Node.js built-in test runner suites (AI, CRM, MCP)
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** `>= 20.x` (Node 22 LTS or Node 24 supported)
- **npm** `>= 10.x`

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/scoobingoo/zalo-chatbot.git
cd zalo-chatbot
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and customize your credentials:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3100` | HTTP server listening port |
| `HOST` | `0.0.0.0` | Bind address (`127.0.0.1` when behind Nginx) |
| `APP_NAME` | `ZaloFlow Studio` | Workspace brand name displayed in UI & headers |
| `ADMIN_USERNAME` | `admin` | Initial admin username (seeded on first boot) |
| `ADMIN_PASSWORD` | `admin123` | Initial admin password (change in Settings after login) |
| `DB_PATH` | `./data/inbox.db` | Path to SQLite database file |
| `AI_SECRET_KEY` | *(auto-generated)* | Base64 32-byte key for AES-256-GCM secret encryption |
| `AI_OAUTH_LOCAL_CALLBACK` | `false` | Set `true` in local dev for automatic ChatGPT OAuth callback |
| `MCP_PUBLIC_URL` | `http://localhost:3100` | Public HTTPS origin used for MCP OAuth discovery |

### 3. Run in Development Mode

```bash
npm run dev
```

Open **[http://localhost:3100](http://localhost:3100)** in your browser:
1. Sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
2. Click **"Quét mã QR kết nối"** and scan the QR code using the Zalo app on your phone.
3. Click **"📇 Đồng bộ"** to import your Zalo friends and groups into the CRM workspace.

---

## 📡 REST API v1 Overview

Authenticate all `/api/v1/*` requests with the `X-API-Key` header (create keys in **Settings & API**).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/send` | Send text or image (`image_url` / base64) to any `to` ID (auto-detects user vs. group) |
| `POST` | `/api/v1/send-phone` | Lookup a Zalo user by `phone` and send text or image |
| `GET` | `/api/v1/search?name=` | Search contacts & threads by name (`type=user\|group` optional) |
| `GET` | `/api/v1/find-phone?phone=` | Resolve a phone number to a Zalo profile without sending a message |
| `GET` | `/api/v1/status` | Check live Zalo channel connection & listener health |

### Example: Send a Message via cURL

```bash
curl -X POST http://localhost:3100/api/v1/send \
  -H "X-API-Key: zik_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890",
    "message": "Hello from ZaloFlow Studio REST API!"
  }'
```

For full request/response schemas, see **[API.md](API.md)**. For MCP configuration with Claude/ChatGPT, see **[MCP.md](MCP.md)**. For deep-dive AI Agent internals, see **[docs/AI-ARCHITECTURE.md](docs/AI-ARCHITECTURE.md)**.

---

## 🧪 Running Tests

The test suite uses Node's built-in test runner (`node:test`) with isolated temporary SQLite databases and mocked LLM/Zalo network layers:

```bash
npm test
```

Covers:
- **AI Engine & Policy (`test/ai-engine.test.js`, `test/ai-policy.test.js`)**: Debouncing, human auto-pause, `/ai` and `/new` commands, tool calling, fallback providers, and active-hours rules.
- **AI Providers & Routes (`test/ai-providers.test.js`, `test/ai-routes.test.js`)**: Key verification, secret masking, AES-256-GCM encryption, and REST validation.
- **CRM, Quick Replies & Analytics (`test/crm-web.test.js`)**: Thread tagging, customer notes, quick reply CRUD, and workspace metrics.
- **MCP & OAuth 2.1 (`test/mcp.test.js`)**: Dynamic client registration, PKCE S256 flow, scope enforcement, and rate-limited message dispatch.

---

## 🚢 Production Deployment

For VPS deployment with **PM2** and **Nginx** (including SSE proxy buffering rules and HTTPS configuration):
- Follow the step-by-step guide in **[SETUP.md](SETUP.md)**.
- Zero-downtime updates with automatic SQLite backup & health verification:
  ```bash
  bash update.sh
  ```

---

## 📄 License

Designed and maintained by **Sonic Lee** as a personal full-stack engineering & AI systems portfolio project.
