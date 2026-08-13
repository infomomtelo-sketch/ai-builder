# AI Builder

AI Builder is a platform for creating and deploying AI workflows, now running on **Cloudflare Workers** with **D1 (SQLite)** for zero-configuration serverless deployment.

## Architecture

| Layer      | Technology                      |
|------------|----------------------------------|
| Runtime    | Cloudflare Workers               |
| Database   | Cloudflare D1 (SQLite)           |
| Sessions   | Cloudflare KV                    |
| Auth       | GitHub OAuth 2.0 + JWT (HS256)   |
| Deploy     | GitHub Actions → Wrangler        |

## Quick Start (Local Dev)

### Prerequisites
- Node.js 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler`)
- Cloudflare account

### 1. Clone & Install

```bash
git clone https://github.com/infomomtelo-sketch/ai-builder.git
cd ai-builder
npm install
```

### 2. Authenticate Wrangler

```bash
wrangler login
```

### 3. Create Cloudflare Resources

```bash
# Create D1 database – note the database_id printed
wrangler d1 create ai-builder-db

# Create KV namespaces – note the ids printed
wrangler kv:namespace create SESSIONS
wrangler kv:namespace create SESSIONS --preview
```

Update `wrangler.toml` with the IDs returned above.

### 4. Apply Database Migrations

```bash
cd packages/worker
npm run db:migrate:local   # local dev
npm run db:migrate         # remote D1
```

### 5. Set Secrets

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET
```

Create a GitHub OAuth App at <https://github.com/settings/developers> with:
- **Homepage URL**: `https://ai-builder.<your-subdomain>.workers.dev`
- **Callback URL**: `https://ai-builder.<your-subdomain>.workers.dev/auth/github/callback`

Also update `APP_URL` in `wrangler.toml`.

### 6. Start Local Dev Server

```bash
npm run dev
# Listening on http://localhost:8787
```

## Auto-Deploy via GitHub Actions (git push)

### Setup GitHub Secrets

In your repository → **Settings → Secrets → Actions**, add:

| Secret                   | Value                                    |
|--------------------------|------------------------------------------|
| `CLOUDFLARE_API_TOKEN`   | API token with Workers & D1 permissions  |
| `CLOUDFLARE_ACCOUNT_ID`  | Your Cloudflare account ID               |

### Deploy

```bash
git push origin main   # triggers .github/workflows/deploy.yml
```

The workflow will:
1. Install dependencies
2. Run D1 migrations
3. Deploy the Worker

## API Reference

All API endpoints require `Authorization: ******` header with a JWT obtained from the auth flow.

### Authentication

| Method | Path                    | Description                        |
|--------|-------------------------|------------------------------------|
| GET    | `/auth/github`          | Redirect to GitHub OAuth           |
| GET    | `/auth/github/callback` | OAuth callback – returns JWT       |
| POST   | `/auth/logout`          | Invalidate session                 |

### Projects

| Method | Path                              | Description              |
|--------|-----------------------------------|--------------------------|
| GET    | `/api/projects`                   | List your projects       |
| POST   | `/api/projects`                   | Create a project         |
| GET    | `/api/projects/:id`               | Get project details      |
| POST   | `/api/projects/:id/workflows`     | Create workflow          |

### Code Generation

| Method | Path           | Body                  | Description              |
|--------|----------------|-----------------------|--------------------------|
| POST   | `/api/generate`| `{ "prompt": "..." }` | Generate code (stub)     |

## Environment Variables

Configure via `wrangler.toml` (`[vars]`) or `wrangler secret put`:

| Variable               | Where        | Description                             |
|------------------------|--------------|-----------------------------------------|
| `GITHUB_CLIENT_ID`     | Secret       | GitHub OAuth App client ID              |
| `GITHUB_CLIENT_SECRET` | Secret       | GitHub OAuth App client secret          |
| `JWT_SECRET`           | Secret       | 32+ character random string for JWT     |
| `APP_URL`              | wrangler.toml| Public Workers URL (no trailing slash)  |
| `ENVIRONMENT`          | wrangler.toml| `production` or `development`           |

## Project Structure

```
ai-builder/
├── wrangler.toml                 # Cloudflare Workers config
├── migrations/
│   └── 0001_init.sql             # D1 schema
├── packages/
│   ├── worker/                   # Cloudflare Worker
│   │   ├── src/
│   │   │   ├── index.ts          # Entry-point & router
│   │   │   ├── auth.ts           # GitHub OAuth + session
│   │   │   ├── api.ts            # REST API handlers
│   │   │   └── utils.ts          # JWT helpers
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── core/                     # AIBuilder core class
│   └── backend/                  # Legacy Express backend (reference)
└── .github/workflows/deploy.yml  # Auto-deploy on push to main
```

## Support

Open an issue at <https://github.com/infomomtelo-sketch/ai-builder/issues>.
