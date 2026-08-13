# AI Builder

AI Builder is a production-focused serverless AI workspace built for Cloudflare Workers, D1, and KV. It includes GitHub OAuth sign-in, project and workflow management, reusable prompts, multi-model generation, real-time SSE streaming, and token/cost tracking.

## Architecture

- **Worker API:** `/packages/worker/src/index.ts`
- **GitHub OAuth + session handling:** `/packages/worker/src/auth.ts`
- **JWT, IDs, crypto helpers:** `/packages/worker/src/utils.ts`
- **Authenticated API surface:** `/packages/worker/src/api.ts`
- **React + Vite frontend:** `/packages/web/src/App.tsx`
- **D1 schema:** `/migrations/0001_init.sql`
- **Cloudflare config:** `/wrangler.toml`
- **Auto deploy workflow:** `/.github/workflows/deploy.yml`

## Features

- GitHub OAuth with CSRF state validation
- JWT-backed 24 hour KV sessions
- D1 persistence for users, projects, workflows, prompts, conversations, and messages
- Multi-provider AI generation with OpenAI and Anthropic models
- Real-time streamed chat responses over SSE
- Token and cost tracking stored per conversation message
- Drag-and-drop style workflow editing
- Prompt templates with variables and tags
- GitHub Actions deployment with D1 migrations

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .dev.vars
   ```

3. Update `wrangler.toml` with your D1 database ID and KV namespace ID.

4. Build the frontend:

   ```bash
   npm run build:web
   ```

5. Start the worker locally:

   ```bash
   npm run dev
   ```

## Required environment variables

- `APP_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `JWT_SECRET`
- `SETTINGS_ENCRYPTION_SECRET`
- `OPENAI_API_KEY` or a saved user OpenAI key
- `ANTHROPIC_API_KEY` or a saved user Anthropic key

## Deployment

Push to `main` to trigger `/.github/workflows/deploy.yml`. The workflow builds the Vite app, applies D1 migrations, and deploys the Worker with bundled static assets.
