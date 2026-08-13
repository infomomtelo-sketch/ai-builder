# AI Builder — Deployment Secrets Reference

This document lists every secret and environment variable required to run AI Builder. Keep this file updated whenever you add new variables.

---

## GitHub Repository Secrets

Set these under **Settings → Secrets and variables → Actions → Repository secrets**.

These are used only by the GitHub Actions deployment workflow and are never passed to the Worker directly.

| Secret name | Description | How to obtain |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token used by Wrangler to deploy | Cloudflare dashboard → My Profile → API Tokens → Create Token → *Edit Cloudflare Workers* template. Add D1 Edit permission. |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account identifier | Visible in the dashboard URL: `https://dash.cloudflare.com/<ACCOUNT_ID>/` |

---

## Cloudflare Worker Secrets

Set these with `wrangler secret put <NAME>` **or** in the Cloudflare dashboard under your Worker → Settings → Variables → Secret Variables.

These are injected as environment variables into the Worker at runtime.

| Variable name | Required | Description |
|---|---|---|
| `APP_URL` | ✅ Yes | Full public URL of the deployed Worker (e.g. `https://ai-builder.acme.workers.dev`). Used in OAuth redirect URLs and CORS. |
| `GITHUB_CLIENT_ID` | ✅ Yes | OAuth App Client ID from GitHub. |
| `GITHUB_CLIENT_SECRET` | ✅ Yes | OAuth App Client Secret from GitHub. |
| `JWT_SECRET` | ✅ Yes | Random 32-byte hex string used to sign session JWTs. Generate: `openssl rand -hex 32` |
| `SETTINGS_ENCRYPTION_SECRET` | ✅ Yes | Random 32-byte hex string used to encrypt stored API keys in D1. Generate: `openssl rand -hex 32` |
| `OPENAI_API_KEY` | ⚠️ Optional | Shared fallback key for OpenAI models. If absent, users must supply their own key via Settings. |
| `ANTHROPIC_API_KEY` | ⚠️ Optional | Shared fallback key for Anthropic models. If absent, users must supply their own key via Settings. |

---

## Setting Secrets

### Via Wrangler CLI (recommended)

```bash
wrangler secret put APP_URL
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put JWT_SECRET
wrangler secret put SETTINGS_ENCRYPTION_SECRET
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

Each command prompts for the value interactively. Values are encrypted and never stored in your terminal history.

### Via Cloudflare Dashboard

1. Go to **Cloudflare Workers & Pages → ai-builder → Settings → Variables**
2. Under **Secret Variables**, click **Add variable**
3. Enter the variable name and value, then click **Encrypt** before saving

---

## Validating Secrets

After deployment, confirm the secrets are active:

```bash
# Lists all secret names (values are never shown)
wrangler secret list
```

To test end-to-end, visit your Worker URL and attempt a GitHub login. A successful login indicates `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_URL`, and `JWT_SECRET` are all configured correctly.

---

## Security Best Practices

- **Never commit secrets to the repository.** `.dev.vars` is listed in `.gitignore` and must stay there.
- **Rotate secrets immediately** if they are accidentally exposed (e.g., printed in logs or committed to git).
- **Use separate OAuth Apps** for development and production to limit blast radius.
- **Grant minimum permissions** to the Cloudflare API token — it only needs Workers and D1 access.
- **Do not share** the `JWT_SECRET` or `SETTINGS_ENCRYPTION_SECRET` across environments; generate fresh values for production.
- Regularly review active API tokens in the Cloudflare dashboard and revoke any that are no longer in use.
