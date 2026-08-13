/**
 * GitHub OAuth handler for Cloudflare Workers.
 *
 * Routes:
 *   GET  /auth/github          – redirect to GitHub OAuth
 *   GET  /auth/github/callback – exchange code, create session, return JWT
 *   POST /auth/logout          – clear session from KV
 */

import { Env } from "./index";
import { signJwt, verifyJwt, generateId } from "./utils";

export async function handleAuth(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  // Initiate OAuth flow
  if (url.pathname === "/auth/github") {
    const state = generateId();
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${env.APP_URL}/auth/github/callback`,
      scope: "read:user user:email",
      state,
    });
    // Store state in KV (5 min TTL) to prevent CSRF
    await env.SESSIONS.put(`oauth_state:${state}`, "1", { expirationTtl: 300 });
    return Response.redirect(
      `https://github.com/login/oauth/authorize?${params}`,
      302
    );
  }

  // OAuth callback
  if (url.pathname === "/auth/github/callback" && request.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return Response.json({ error: "Missing code or state" }, { status: 400 });
    }

    // Validate state
    const storedState = await env.SESSIONS.get(`oauth_state:${state}`);
    if (!storedState) {
      return Response.json({ error: "Invalid or expired state" }, { status: 400 });
    }
    await env.SESSIONS.delete(`oauth_state:${state}`);

    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${env.APP_URL}/auth/github/callback`,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenData.access_token) {
      return Response.json(
        { error: "GitHub OAuth failed", detail: tokenData.error },
        { status: 400 }
      );
    }

    // Fetch GitHub user profile
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: "Bearer " + tokenData.access_token,
        "User-Agent": "ai-builder-worker",
      },
    });
    const githubUser = (await userRes.json()) as {
      id: number;
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };

    // Upsert user in D1
    const userId = generateId();
    await env.DB.prepare(
      `INSERT INTO users (id, github_id, login, name, email, avatar_url)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(github_id) DO UPDATE SET
         login = excluded.login,
         name = excluded.name,
         email = excluded.email,
         avatar_url = excluded.avatar_url,
         updated_at = datetime('now')`
    )
      .bind(
        userId,
        githubUser.id,
        githubUser.login,
        githubUser.name ?? null,
        githubUser.email ?? null,
        githubUser.avatar_url ?? null
      )
      .run();

    // Fetch the actual stored user (to get correct id on conflict)
    const user = await env.DB.prepare(
      "SELECT id, login, name, email, avatar_url FROM users WHERE github_id = ?"
    )
      .bind(githubUser.id)
      .first<{
        id: string;
        login: string;
        name: string;
        email: string;
        avatar_url: string;
      }>();

    if (!user) {
      return Response.json({ error: "User creation failed" }, { status: 500 });
    }

    // Issue JWT
    const jwt = await signJwt(
      { sub: user.id, login: user.login },
      env.JWT_SECRET
    );

    // Store session in KV (24-hour TTL)
    await env.SESSIONS.put(
      `session:${user.id}`,
      JSON.stringify({ userId: user.id, login: user.login }),
      { expirationTtl: 86400 }
    );

    return Response.json({ token: jwt, user });
  }

  // Logout
  if (url.pathname === "/auth/logout" && request.method === "POST") {
    const payload = await verifyJwt(request, env.JWT_SECRET);
    if (payload) {
      await env.SESSIONS.delete(`session:${payload.sub}`);
    }
    return Response.json({ success: true });
  }

  return new Response("Not Found", { status: 404 });
}
