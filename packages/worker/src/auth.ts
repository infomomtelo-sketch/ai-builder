import { Env, generateId, getCookie, json, setCookie, signJwt, verifyJwt } from "./utils";

const SESSION_TTL_SECONDS = 60 * 60 * 24;
const OAUTH_STATE_COOKIE = "ai_builder_oauth_state";
const SESSION_COOKIE = "ai_builder_token";

export interface AuthUser {
  id: string;
  githubId: string;
  username: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuthSession {
  sessionId: string;
  user: AuthUser;
}

interface SessionTokenPayload {
  sub: string;
  sessionId: string;
  [key: string]: unknown;
}

function appUrl(request: Request, env: Env) {
  return env.APP_URL ?? new URL(request.url).origin;
}

function isSecureRequest(request: Request, env: Env) {
  return appUrl(request, env).startsWith("https://");
}

function sessionCookie(request: Request, env: Env, value: string) {
  return setCookie(SESSION_COOKIE, value, {
    Path: "/",
    HttpOnly: true,
    SameSite: "Lax",
    "Max-Age": SESSION_TTL_SECONDS,
    Secure: isSecureRequest(request, env),
  });
}

function clearCookie(request: Request, env: Env, name: string) {
  return setCookie(name, "", {
    Path: "/",
    HttpOnly: true,
    SameSite: "Lax",
    "Max-Age": 0,
    Secure: isSecureRequest(request, env),
  });
}

export async function handleAuthRequest(request: Request, env: Env, pathname: string) {
  if (pathname === "/api/auth/github" && request.method === "GET") {
    return startGithubOAuth(request, env);
  }

  if (pathname === "/api/auth/callback/github" && request.method === "GET") {
    return finishGithubOAuth(request, env);
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    return logout(request, env);
  }

  return json({ error: "Not found" }, { status: 404 });
}

async function startGithubOAuth(request: Request, env: Env) {
  const state = generateId();
  await env.SESSIONS.put(`oauth:${state}`, JSON.stringify({ createdAt: Date.now() }), {
    expirationTtl: 60 * 10,
  });

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${appUrl(request, env)}/api/auth/callback/github`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: new Headers({
      Location: url.toString(),
      "Set-Cookie": setCookie(OAUTH_STATE_COOKIE, state, {
        Path: "/",
        HttpOnly: true,
        SameSite: "Lax",
        "Max-Age": 60 * 10,
        Secure: isSecureRequest(request, env),
      }),
    }),
  });
}

async function finishGithubOAuth(request: Request, env: Env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = getCookie(request, OAUTH_STATE_COOKIE);
  const redirectUrl = new URL("/auth/callback", appUrl(request, env));

  if (!code || !state || state !== cookieState) {
    redirectUrl.searchParams.set("error", "invalid_state");
    return redirect(request, env, redirectUrl.toString(), [clearCookie(request, env, OAUTH_STATE_COOKIE)]);
  }

  const storedState = await env.SESSIONS.get(`oauth:${state}`, "text");
  await env.SESSIONS.delete(`oauth:${state}`);
  if (!storedState) {
    redirectUrl.searchParams.set("error", "expired_state");
    return redirect(request, env, redirectUrl.toString(), [clearCookie(request, env, OAUTH_STATE_COOKIE)]);
  }

  try {
    const accessToken = await exchangeGithubCode(code, request, env);
    const user = await fetchGithubUser(accessToken);
    const dbUser = await upsertGithubUser(env, user);

    const sessionId = generateId();
    const session: AuthSession = {
      sessionId,
      user: dbUser,
    };

    await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), {
      expirationTtl: SESSION_TTL_SECONDS,
    });

    const token = await signJwt(
      {
        sub: dbUser.id,
        sessionId,
      },
      env.JWT_SECRET,
      SESSION_TTL_SECONDS,
    );

    redirectUrl.searchParams.set("success", "1");
    return redirect(request, env, redirectUrl.toString(), [
      sessionCookie(request, env, token),
      clearCookie(request, env, OAUTH_STATE_COOKIE),
    ]);
  } catch (error) {
    redirectUrl.searchParams.set("error", error instanceof Error ? error.message : "oauth_failed");
    return redirect(request, env, redirectUrl.toString(), [clearCookie(request, env, OAUTH_STATE_COOKIE)]);
  }
}

async function exchangeGithubCode(code: string, request: Request, env: Env) {
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: `${appUrl(request, env)}/api/auth/callback/github`,
  });

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error ?? "Unable to sign in with GitHub.");
  }

  return payload.access_token;
}

async function fetchGithubUser(accessToken: string) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + accessToken,
    "User-Agent": "ai-builder",
  };

  const [userResponse, emailResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);

  if (!userResponse.ok) {
    throw new Error("Unable to fetch GitHub profile.");
  }

  const user = (await userResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  let primaryEmail: string | null = null;
  if (emailResponse.ok) {
    const emails = (await emailResponse.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    primaryEmail = emails.find((entry) => entry.primary && entry.verified)?.email ?? emails[0]?.email ?? null;
  }

  return {
    githubId: String(user.id),
    username: user.login,
    name: user.name ?? user.login,
    email: primaryEmail,
    avatarUrl: user.avatar_url,
  };
}

async function upsertGithubUser(
  env: Env,
  user: { githubId: string; username: string; email: string | null; name: string; avatarUrl: string | null },
) {
  const existing = await env.DB.prepare("SELECT id, bio FROM users WHERE github_id = ?").bind(user.githubId).first<{
    id: string;
    bio: string | null;
  }>();

  const id = existing?.id ?? generateId();

  await env.DB.prepare(
    `
      INSERT INTO users (id, github_id, username, email, name, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(github_id) DO UPDATE SET
        username = excluded.username,
        email = excluded.email,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        updated_at = CURRENT_TIMESTAMP
    `,
  )
    .bind(id, user.githubId, user.username, user.email, user.name, user.avatarUrl)
    .run();

  await env.DB.prepare(
    `
      INSERT INTO user_settings (user_id)
      VALUES (?)
      ON CONFLICT(user_id) DO NOTHING
    `,
  )
    .bind(id)
    .run();

  return {
    id,
    githubId: user.githubId,
    username: user.username,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

function redirect(request: Request, env: Env, location: string, cookies: string[]) {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(null, {
    status: 302,
    headers,
  });
}

export async function requireAuth(request: Request, env: Env) {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const cookieToken = getCookie(request, SESSION_COOKIE);
  const token = bearerToken ?? cookieToken;

  if (!token) return null;

  const payload = await verifyJwt<SessionTokenPayload>(token, env.JWT_SECRET);
  if (!payload?.sessionId || typeof payload.sub !== "string") {
    return null;
  }

  const session = await env.SESSIONS.get(`session:${payload.sessionId}`, "text");
  if (!session) return null;

  const parsed = JSON.parse(session) as AuthSession;
  if (parsed.user.id !== payload.sub) return null;
  return parsed;
}

async function logout(request: Request, env: Env) {
  const session = await requireAuth(request, env);
  if (session) {
    await env.SESSIONS.delete(`session:${session.sessionId}`);
  }

  return json(
    { success: true },
    {
      headers: new Headers({
        "Set-Cookie": clearCookie(request, env, SESSION_COOKIE),
      }),
    },
  );
}
