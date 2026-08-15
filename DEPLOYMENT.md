# Deployment Guide

This guide walks you through deploying AI Builder to Cloudflare Workers from scratch. Allow approximately 20–30 minutes for a first-time setup.

---

## Prerequisites

- [ ] [Node.js 20+](https://nodejs.org/) installed
- [ ] [npm 10+](https://www.npmjs.com/) installed
- [ ] [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- [ ] [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [ ] [GitHub account](https://github.com/) for OAuth login
- [ ] Repository cloned locally (`git clone https://github.com/infomomtelo-sketch/ai-builder`)

---

## Step 1 — Cloudflare Setup

### 1a. Log in to Wrangler

```bash
wrangler login
```

This opens a browser window and authorises the CLI against your Cloudflare account.

### 1b. Create a D1 (SQLite) database

```bash
wrangler d1 create ai-builder
```

Copy the **`database_id`** from the output. You will need it in Step 3.

### 1c. Create a KV namespace for sessions

```bash
wrangler kv namespace create ai-builder-sessions
```

Copy the **`id`** from the output. You will need it in Step 3.

### 1d. Note your Account ID

Your Cloudflare Account ID is visible in the URL when you are logged in to the dashboard:

```
https://dash.cloudflare.com/<ACCOUNT_ID>/
```

---

## Step 2 — GitHub OAuth App

1. Go to **GitHub Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in the following fields:

   | Field | Value |
   |---|---|
   | Application name | `AI Builder` |
   | Homepage URL | `https://ai-builder.<your-account>.workers.dev` |
   | Authorization callback URL | `https://ai-builder.<your-account>.workers.dev/api/auth/callback/github` |

3. Click **Register application**
4. Note the **Client ID**
5. Click **Generate a new client secret** and note the **Client Secret**

> **Tip:** You can update the URLs after deployment once you know your final Workers domain.

---

## Step 3 — Configure `wrangler.toml`

Open `wrangler.toml` and replace the two placeholder IDs with the values from Steps 1b and 1c:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-builder"
database_id = "<PASTE_D1_DATABASE_ID_HERE>"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "SESSIONS"
id = "<PASTE_KV_NAMESPACE_ID_HERE>"
```

---

## Step 4 — Environment Variables

Environment variables for the Worker are set as **Cloudflare Worker Secrets** so they are not stored in plaintext.

### Generate random secrets

```bash
# Requires OpenSSL (available on macOS/Linux; use Git Bash on Windows)
openssl rand -hex 32   # run twice: one value for JWT_SECRET, one for SETTINGS_ENCRYPTION_SECRET
```

### Set secrets via Wrangler

```bash
wrangler secret put APP_URL                   # e.g. https://ai-builder.<account>.workers.dev
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put SETTINGS_ENCRYPTION_SECRET
wrangler secret put OPENAI_API_KEY            # optional: shared fallback key
wrangler secret put ANTHROPIC_API_KEY         # optional: shared fallback key
```

Each command prompts you to paste the value. The secret is encrypted and stored by Cloudflare.

See [`.github/DEPLOYMENT_SECRETS.md`](.github/DEPLOYMENT_SECRETS.md) for the full reference of all required variables.

---

## Step 5 — Local Development (optional)

Before deploying you can run the stack locally.

```bash
# Install dependencies
npm install

# Copy example env file
cp .env.example .dev.vars
# Edit .dev.vars with your real values for local testing

# Apply migrations to the local D1 database
npm run db:migrate

# Build the frontend once
npm run build:web

# Start the local Worker
npm run dev
```

The app is available at `http://127.0.0.1:8787`.

---

## Step 6 — First Deployment

### Option A: Manual deploy from your machine

```bash
npm run deploy
```

This builds the Vite frontend, then calls `wrangler deploy`.

### Option B: Automated deploy via GitHub Actions

1. Add the following **Repository Secrets** in GitHub  
   (`Settings → Secrets and variables → Actions → New repository secret`):

   | Secret name | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | Create at Cloudflare → My Profile → API Tokens with *Edit Workers* permission |
   | `CLOUDFLARE_ACCOUNT_ID` | From your Cloudflare dashboard URL |
   | `D1_DATABASE_ID` | D1 database ID from Step 1b |
   | `KV_NAMESPACE_ID` | KV namespace ID from Step 1c |
   | `KV_PREVIEW_ID` | KV preview namespace ID from `wrangler kv namespace create ai-builder-sessions --preview` |

2. Push to the `main` branch:

   ```bash
   git push origin main
   ```

The workflow defined in `.github/workflows/deploy.yml` will automatically:
- Install dependencies
- Build the Vite frontend
- Apply D1 migrations remotely
- Deploy the Worker with bundled assets

---

## Step 7 — Apply Database Migrations

If you used Option A (manual deploy), apply the migrations to the remote D1 database:

```bash
npx wrangler d1 migrations apply ai-builder --remote --config wrangler.toml
```

For Option B, the GitHub Actions workflow handles this automatically.

---

## Post-deployment Checklist

- [ ] Visit `https://ai-builder.<account>.workers.dev` — the app loads
- [ ] Click **Sign in with GitHub** — OAuth redirect works
- [ ] Profile page shows your GitHub username
- [ ] Create a project and a workflow
- [ ] Test a prompt with an AI model

---

## Troubleshooting

### `Error: No D1 database found with name "ai-builder"`
Your `wrangler.toml` `database_id` is still a placeholder. Complete Step 3.

### OAuth callback returns 400 or loops
- Verify the **Authorization callback URL** in your GitHub OAuth App exactly matches  
  `https://<your-domain>/api/auth/callback/github`.
- Ensure `APP_URL` secret matches your deployed domain.

### `JWT_SECRET is required` error in logs
The Worker secret was not set. Run `wrangler secret put JWT_SECRET`.

### Migrations fail with `table already exists`
Safe to ignore — the migrations use `CREATE TABLE IF NOT EXISTS`. Re-run with `--remote` to confirm.

### Build fails in GitHub Actions
- Check that both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set.
- Ensure the API token has at least **Cloudflare Workers:Edit** and **D1:Edit** permissions.

### Worker returns `Internal Server Error`
Check real-time logs:
```bash
wrangler tail
```
