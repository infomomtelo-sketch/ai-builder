# AI Builder

## Overview

AI Builder is a comprehensive full-stack AI builder platform. Build, manage, and deploy AI-powered workflows using multiple LLM providers — all with GitHub OAuth authentication and a modern React dashboard.

## Features

- **GitHub OAuth Sign-in** — one-click authentication via GitHub OAuth2
- **Multi-model LLM support** — GPT-4o, Claude 3.5, and more; switch mid-conversation
- **Real-time streaming** — token-by-token responses via Server-Sent Events
- **Token counting & cost estimation** — per-message usage tracking
- **Visual Workflow Builder** — drag-and-drop node-based pipeline editor
- **Projects** — organize conversations, workflows, and prompts
- **Saved Prompts** — reusable prompt templates with variable support
- **Settings** — per-user API keys, default model, and profile preferences
- **Prisma + PostgreSQL** — fully typed database layer

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Auth | NextAuth.js v4 + GitHub OAuth |
| Database | PostgreSQL + Prisma ORM |
| AI SDKs | OpenAI SDK, Anthropic SDK |
| Styling | Tailwind CSS |

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/infomomtelo-sketch/ai-builder
cd ai-builder
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random 32+ char secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `OPENAI_API_KEY` | OpenAI API key (optional) |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional) |

### 3. GitHub OAuth App

1. Go to https://github.com/settings/developers → **New OAuth App**
2. Set **Homepage URL**: `http://localhost:3000`
3. Set **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Copy the **Client ID** and **Client Secret** into `.env.local`

### 4. Database

```bash
npm run db:push        # Push schema to database
npm run db:generate    # Generate Prisma client
npm run db:studio      # Open Prisma Studio (optional)
```

### 5. Run

```bash
npm run dev            # Start development server on :3000
```

## Authentication Flow

```
Landing Page (/)
  ↓ "Sign in with GitHub" button
/auth/signin
  ↓ signIn('github')
GitHub OAuth Authorization
  ↓ redirect with code
/api/auth/callback/github   ← NextAuth handles token exchange
  ↓ upsert user in PostgreSQL
/dashboard
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/generate` | Stream AI completions |
| GET/POST | `/api/projects` | List / create projects |
| GET/PATCH/DELETE | `/api/projects/:id` | Project CRUD |
| GET/POST | `/api/workflows` | List / create workflows |
| GET/PATCH/DELETE | `/api/workflows/:id` | Workflow CRUD |
| GET/POST | `/api/conversations` | List / create conversations |
| GET/DELETE | `/api/conversations/:id` | Conversation with messages |
| GET/POST | `/api/prompts` | List / create saved prompts |
| GET/PATCH/DELETE | `/api/prompts/:id` | Prompt CRUD |
| GET/PATCH | `/api/user` | User profile & settings |
| GET | `/api/health` | Health check |

## Directory Structure

```
app/
  api/             ← Next.js API routes
    auth/[...nextauth]/  ← GitHub OAuth handler
    generate/      ← Streaming AI completions
    projects/      ← Project CRUD
    workflows/     ← Workflow CRUD
    conversations/ ← Conversation + messages
    prompts/       ← Saved prompt templates
    user/          ← Profile & settings
    health/        ← Health check
  auth/signin/     ← Sign-in page
  dashboard/       ← Main dashboard
  chat/            ← Streaming chat interface
  workflows/       ← Workflow builder & detail
  projects/        ← Project list & detail
  settings/        ← User settings
lib/
  ai.ts            ← Multi-model AI core (OpenAI + Anthropic)
  auth.ts          ← Session helpers
  prisma.ts        ← Prisma singleton
  rateLimit.ts     ← In-memory rate limiter
prisma/
  schema.prisma    ← Database schema
types/
  next-auth.d.ts   ← Session type augmentation
```

## Security

- All API routes require an authenticated session
- Rate limiting: 20 requests/minute per user on the generate endpoint
- API keys stored server-side; user-supplied keys stored in the database
- NEXTAUTH_SECRET must be set and kept private
- Environment variables never exposed to the client


## Features
- **User-Friendly Interface**: Intuitive design for seamless navigation.
- **Scalability**: Suitable for both small projects and enterprise-level applications.
- **Integration**: Easily integrate with existing systems and APIs.

## Getting Started
1. Clone the repository: `git clone https://github.com/infomomtelo-sketch/ai-builder.git`
2. Install dependencies: `npm install`
3. Start the application: `npm start`

## Documentation
Further documentation is available on our [wiki](https://github.com/infomomtelo-sketch/ai-builder/wiki).

## Support
For support, please open an issue in this repository.