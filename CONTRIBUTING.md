# Contributing to AI Builder

Thank you for your interest in contributing! This guide explains how to set up a local development environment and get started.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Setup](#local-setup)
3. [Environment File](#environment-file)
4. [Running the App Locally](#running-the-app-locally)
5. [Running Tests and Type Checks](#running-tests-and-type-checks)
6. [Code Structure](#code-structure)
7. [Pull Request Guidelines](#pull-request-guidelines)

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 | https://nodejs.org/ |
| npm | 10 | Bundled with Node.js |
| Wrangler CLI | 4 | `npm install -g wrangler` |
| Git | any | https://git-scm.com/ |

---

## Local Setup

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/ai-builder.git
cd ai-builder

# 2. Install all dependencies
npm install

# 3. Create a local D1 database and apply migrations
npm run db:migrate
```

---

## Environment File

The Worker reads secrets from a `.dev.vars` file when running locally (equivalent to Cloudflare Worker Secrets in production).

```bash
cp .env.example .dev.vars
```

Then edit `.dev.vars` with real values:

```env
APP_URL="http://127.0.0.1:8787"

GITHUB_CLIENT_ID="your-github-oauth-client-id"
GITHUB_CLIENT_SECRET="your-github-oauth-client-secret"

JWT_SECRET="any-random-32-char-string-for-local-dev"
SETTINGS_ENCRYPTION_SECRET="another-random-32-char-string"

# Optional — users can supply their own keys via the Settings UI
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
```

For the GitHub OAuth values, create a **development OAuth App** at  
`GitHub Settings → Developer settings → OAuth Apps → New OAuth App` with:
- Homepage URL: `http://127.0.0.1:8787`
- Callback URL: `http://127.0.0.1:8787/api/auth/callback/github`

---

## Running the App Locally

```bash
# Build the Vite frontend (required before first run)
npm run build:web

# Start the local Cloudflare Worker with hot reload
npm run dev
```

The app is available at `http://127.0.0.1:8787`.

To develop the frontend with hot module replacement:

```bash
# Terminal 1 — start the Worker
npm run dev

# Terminal 2 — start Vite dev server (proxies /api/* to the Worker)
npm run dev:web
```

---

## Running Tests and Type Checks

```bash
# Type-check the Worker package
npm run typecheck:worker

# Type-check the web package
npm run typecheck:web

# Build the web bundle (validates output)
npm run build:web

# Run all checks at once (used in CI)
npm test
```

There are no runtime unit tests yet. Type checking and a successful build serve as the primary CI gate.

---

## Code Structure

```
ai-builder/
├── packages/
│   ├── worker/          Cloudflare Worker (backend)
│   │   └── src/
│   │       ├── index.ts       Request router & asset serving
│   │       ├── auth.ts        GitHub OAuth + JWT session handling
│   │       ├── api.ts         Authenticated REST endpoints
│   │       ├── utils.ts       JWT helpers, ID generation, crypto
│   │       └── bindings.d.ts  TypeScript definitions for D1 & KV
│   ├── web/             React + Vite frontend
│   │   └── src/
│   │       ├── App.tsx        Main application UI
│   │       ├── main.tsx       React entry point
│   │       └── styles.css     Tailwind-based styles
│   ├── core/            Framework stub (AIBuilder class)
│   └── backend/         Reserved for future use
├── migrations/
│   └── 0001_init.sql    D1 schema (users, projects, workflows, …)
├── .github/
│   └── workflows/
│       └── deploy.yml   CI/CD: build + migrate + deploy on push to main
├── wrangler.toml        Cloudflare configuration
├── package.json         Monorepo scripts
└── .env.example         Template for .dev.vars
```

### Key files to understand first

| File | Purpose |
|---|---|
| `packages/worker/src/index.ts` | Entry point — routes requests |
| `packages/worker/src/auth.ts` | GitHub OAuth flow & session management |
| `packages/worker/src/api.ts` | All `/api/*` endpoints |
| `packages/web/src/App.tsx` | Complete SPA frontend |
| `migrations/0001_init.sql` | Database schema |

---

## Pull Request Guidelines

1. **Branch naming** — use a descriptive name: `feat/streaming-improvements`, `fix/oauth-state-cookie`
2. **One concern per PR** — keep changes focused
3. **Type checks must pass** — `npm test` must exit 0
4. **Update documentation** if you change public-facing behaviour (API responses, env vars, etc.)
5. **No secrets in code** — never commit real keys or tokens
6. **Describe your changes** in the PR description, including any new environment variables or Cloudflare resources required

For significant changes, open an issue first to discuss the approach before coding.
