# Architecture

This document describes the system design of AI Builder — a serverless AI workspace platform running on Cloudflare Workers.

---

## Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                      │
│  packages/web/src/App.tsx                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Auth UI    │  │  Dashboard   │  │  Chat / AI Generate    │  │
│  │  (login /   │  │  Projects,   │  │  Streaming SSE client  │  │
│  │   profile)  │  │  Workflows,  │  │  Model selector        │  │
│  └─────────────┘  │  Prompts     │  └────────────────────────┘  │
│                   └──────────────┘                               │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               Cloudflare Worker  (packages/worker/src/)          │
│                                                                  │
│  index.ts         — request router & static asset serving        │
│  auth.ts          — GitHub OAuth 2.0 + JWT sessions              │
│  api.ts           — authenticated REST API endpoints             │
│  utils.ts         — JWT signing, ID generation, AES-GCM crypto   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────────────────────────────┐  │
│  │  D1 (SQLite) │  │  KV (Cloudflare KV)                      │  │
│  │  Binding: DB │  │  Binding: SESSIONS                       │  │
│  │              │  │                                          │  │
│  │  users       │  │  oauth:{state}   — CSRF tokens (10 min) │  │
│  │  user_settings│  │  session:{id}   — JWT session (24 hr)  │  │
│  │  projects    │  └──────────────────────────────────────────┘  │
│  │  workflows   │                                                 │
│  │  prompts     │  ┌──────────────────────────────────────────┐  │
│  │  conversations│  │  ASSETS (static files)                  │  │
│  │  messages    │  │  Bundled React SPA from packages/web/dist│  │
│  └──────────────┘  └──────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS (server-side calls)
                    ┌──────────┴──────────┐
                    ▼                     ▼
             ┌────────────┐       ┌────────────────┐
             │  OpenAI    │       │  Anthropic     │
             │  API       │       │  API           │
             │  gpt-4o    │       │  claude-3-5-   │
             │  gpt-4o-mini│      │  sonnet / haiku│
             └────────────┘       └────────────────┘
```

---

## Request Routing

All HTTP requests are handled by the Cloudflare Worker entry point (`index.ts`):

| Path pattern | Handler | Description |
|---|---|---|
| `GET /api/health` | Inline | Liveness check (no auth) |
| `GET /api/auth/github` | `auth.ts` | Initiate GitHub OAuth |
| `GET /api/auth/callback/github` | `auth.ts` | OAuth callback → issue JWT |
| `POST /api/auth/logout` | `auth.ts` | Invalidate session in KV |
| `/api/*` | `api.ts` | All authenticated endpoints |
| `*` (fallback) | `ASSETS` binding | Serve bundled React SPA |

---

## Authentication Flow

```
Browser                     Worker                    GitHub
   │                           │                         │
   │  GET /api/auth/github      │                         │
   │──────────────────────────►│                         │
   │                           │  store oauth:{state} in KV (10 min TTL)
   │                           │  set state cookie        │
   │  302 → github.com/oauth   │                         │
   │◄──────────────────────────│                         │
   │                           │                         │
   │  (user authorises on GitHub)                        │
   │                           │                         │
   │  GET /api/auth/callback/github?code=&state=         │
   │──────────────────────────►│                         │
   │                           │  validate state (cookie == KV entry)
   │                           │  POST /login/oauth/access_token
   │                           │────────────────────────►│
   │                           │  token                  │
   │                           │◄────────────────────────│
   │                           │  GET /user + /user/emails
   │                           │────────────────────────►│
   │                           │  profile + email        │
   │                           │◄────────────────────────│
   │                           │  upsert user in D1       │
   │                           │  store session:{id} in KV (24 hr TTL)
   │                           │  sign JWT (24 hr)        │
   │  302 → / (with JWT cookie)│                         │
   │◄──────────────────────────│                         │
   │                           │                         │
   │  GET /api/me (Authorization: ******          │
   │──────────────────────────►│                         │
   │                           │  verify JWT signature    │
   │                           │  check session in KV     │
   │  200 { user, settings }   │                         │
   │◄──────────────────────────│                         │
```

---

## AI Generation Flow

```
Browser                           Worker                   AI Provider
   │                                │                           │
   │  POST /api/generate            │                           │
   │  { model, messages, stream:true}                          │
   │──────────────────────────────►│                           │
   │                                │  authenticate JWT         │
   │                                │  resolve API key          │
   │                                │  (user-saved or shared)   │
   │                                │                           │
   │                                │  POST /chat/completions   │
   │                                │  (stream: true)           │
   │                                │──────────────────────────►│
   │                                │                           │
   │  text/event-stream             │  stream chunks            │
   │  data: {"chunk":"..."}        │◄──────────────────────────│
   │◄──────────────────────────────│                           │
   │  data: {"chunk":"..."}        │                           │
   │◄──────────────────────────────│                           │
   │                                │  final usage event        │
   │  data: {"done":true,           │◄──────────────────────────│
   │    "conversationId":"...",     │                           │
   │    "usage":{...}}             │  save message + cost to D1 │
   │◄──────────────────────────────│  update conversation totals│
```

---

## Database Schema

```
users
  id TEXT PK
  github_id TEXT UNIQUE
  username TEXT
  email TEXT
  name TEXT
  avatar_url TEXT
  bio TEXT
  created_at TEXT
  updated_at TEXT

user_settings
  user_id TEXT PK → users.id
  default_model TEXT
  theme TEXT
  api_keys TEXT  (AES-GCM encrypted JSON: {openai?, anthropic?})
  preferences TEXT (JSON)
  updated_at TEXT

projects
  id TEXT PK
  user_id TEXT → users.id
  name TEXT
  description TEXT
  created_at TEXT
  updated_at TEXT

workflows
  id TEXT PK
  user_id TEXT → users.id
  project_id TEXT → projects.id (nullable)
  name TEXT
  description TEXT
  definition TEXT  (JSON: {nodes:[], edges:[]})
  status TEXT      (draft | published)
  created_at TEXT
  updated_at TEXT

prompts
  id TEXT PK
  user_id TEXT → users.id
  project_id TEXT → projects.id (nullable)
  name TEXT
  description TEXT
  template TEXT
  variables TEXT  (JSON array)
  tags TEXT       (JSON array)
  created_at TEXT
  updated_at TEXT

conversations
  id TEXT PK
  user_id TEXT → users.id
  project_id TEXT → projects.id (nullable)
  title TEXT
  model TEXT
  total_input_tokens INTEGER
  total_output_tokens INTEGER
  total_cost REAL
  created_at TEXT
  updated_at TEXT

messages
  id TEXT PK
  conversation_id TEXT → conversations.id
  role TEXT  (system | user | assistant)
  content TEXT
  model TEXT (nullable)
  input_tokens INTEGER
  output_tokens INTEGER
  cost REAL
  created_at TEXT
```

---

## API Endpoint Reference

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Liveness check |

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/github` | None | Start OAuth flow |
| GET | `/api/auth/callback/github` | None | OAuth callback |
| POST | `/api/auth/logout` | JWT | Delete session |

### User

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/me` | JWT | Profile + settings + stats |
| PATCH | `/api/me` | JWT | Update profile or settings |

### Projects

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/projects` | JWT | List all projects |
| POST | `/api/projects` | JWT | Create project |
| GET | `/api/projects/:id` | JWT | Get single project |
| PATCH | `/api/projects/:id` | JWT | Update project |
| DELETE | `/api/projects/:id` | JWT | Delete project |

### Workflows

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/workflows` | JWT | List workflows (optional `?projectId=`) |
| POST | `/api/workflows` | JWT | Create workflow |
| GET | `/api/workflows/:id` | JWT | Get single workflow |
| PATCH | `/api/workflows/:id` | JWT | Update workflow |
| DELETE | `/api/workflows/:id` | JWT | Delete workflow |

### Prompts

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/prompts` | JWT | List prompts (optional `?projectId=`) |
| POST | `/api/prompts` | JWT | Create prompt |
| GET | `/api/prompts/:id` | JWT | Get single prompt |
| PATCH | `/api/prompts/:id` | JWT | Update prompt |
| DELETE | `/api/prompts/:id` | JWT | Delete prompt |

### Conversations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/conversations` | JWT | List conversations |
| GET | `/api/conversations/:id` | JWT | Get conversation + messages |
| DELETE | `/api/conversations/:id` | JWT | Delete conversation |

### AI Generation

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/generate` | JWT | Send messages, get streamed response |

---

## Cost Tracking

Per-model pricing (USD per 1 000 tokens):

| Model | Input | Output |
|---|---|---|
| `gpt-4o` | $0.005 | $0.015 |
| `gpt-4o-mini` | $0.00015 | $0.0006 |
| `gpt-4.1` | $0.002 | $0.008 |
| `claude-3-5-sonnet-20241022` | $0.003 | $0.015 |
| `claude-3-5-haiku-20241022` | $0.0008 | $0.004 |

Token counts come from the provider API usage fields. A character-based fallback (`chars / 4`) is used when the provider does not return a usage event.

---

## CI/CD Pipeline

```
git push origin main
       │
       ▼
GitHub Actions (.github/workflows/deploy.yml)
  1. actions/checkout@v4
  2. actions/setup-node@v4  (Node 20, npm cache)
  3. npm ci
  4. npm run build:web       → packages/web/dist/
  5. wrangler d1 migrations apply ai-builder --remote
  6. wrangler deploy         → uploads Worker + bundled assets
```

Required GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
