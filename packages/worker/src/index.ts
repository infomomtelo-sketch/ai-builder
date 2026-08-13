/**
 * Cloudflare Workers entry-point for AI Builder.
 *
 * Bindings (defined in wrangler.toml):
 *   DB       – D1 (SQLite) database
 *   SESSIONS – KV namespace for session storage
 *
 * Secrets (set via `wrangler secret put`):
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, JWT_SECRET
 */

import { handleAuth } from "./auth";
import { handleApi } from "./api";

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  APP_URL: string;
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }), env);
    }

    try {
      // Health check
      if (url.pathname === "/health" && request.method === "GET") {
        return corsResponse(
          Response.json({ status: "ok", timestamp: new Date().toISOString() }),
          env
        );
      }

      // GitHub OAuth routes
      if (url.pathname.startsWith("/auth/")) {
        return corsResponse(await handleAuth(request, env, url), env);
      }

      // API routes (require valid JWT session)
      if (url.pathname.startsWith("/api/")) {
        return corsResponse(await handleApi(request, env, url), env);
      }

      return corsResponse(new Response("Not Found", { status: 404 }), env);
    } catch (err) {
      console.error("Unhandled error:", err);
      return corsResponse(
        Response.json({ error: "Internal Server Error" }, { status: 500 }),
        env
      );
    }
  },
};

function corsResponse(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  // Restrict CORS to the known app origin; fall back to wildcard for local dev
  const allowedOrigin = env.APP_URL ?? "*";
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
