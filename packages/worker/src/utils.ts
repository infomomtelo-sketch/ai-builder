const encoder = new TextEncoder();

export interface Env {
  APP_URL?: string;
  JWT_SECRET: string;
  SETTINGS_ENCRYPTION_SECRET?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  DB: D1Database;
  SESSIONS: KVNamespace;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

export function generateId() {
  return crypto.randomUUID();
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJson<T>(request: Request) {
  return (await request.json()) as T;
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  for (const pair of cookie.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function setCookie(name: string, value: string, options: Record<string, string | number | boolean> = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  for (const [key, rawValue] of Object.entries(options)) {
    if (rawValue === false || rawValue === undefined || rawValue === null) continue;
    if (rawValue === true) {
      parts.push(key);
      continue;
    }
    parts.push(`${key}=${rawValue}`);
  }
  return parts.join("; ");
}

export function withCors(request: Request, response: Response) {
  const origin = request.headers.get("origin") ?? "*";
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "authorization,content-type");
  headers.append("vary", "origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsPreflight(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function createHmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signJwt(payload: Record<string, unknown>, secret: string, expiresInSeconds = 60 * 60 * 24) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const headerValue = bytesToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadValue = bytesToBase64Url(encoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerValue}.${payloadValue}`;
  const signature = await crypto.subtle.sign("HMAC", await createHmacKey(secret), encoder.encode(signingInput));
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwt<T extends Record<string, unknown>>(token: string, secret: string) {
  const [headerValue, payloadValue, signatureValue] = token.split(".");
  if (!headerValue || !payloadValue || !signatureValue) return null;

  const signingInput = `${headerValue}.${payloadValue}`;
  const verified = await crypto.subtle.verify(
    "HMAC",
    await createHmacKey(secret),
    base64UrlToBytes(signatureValue),
    encoder.encode(signingInput),
  );

  if (!verified) return null;

  const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadValue))) as T & { exp?: number };
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function createAesKey(secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await createAesKey(secret), encoder.encode(value));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string, secret: string) {
  const [ivValue, cipherValue] = value.split(".");
  if (!ivValue || !cipherValue) return "";
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivValue) },
    await createAesKey(secret),
    base64UrlToBytes(cipherValue),
  );
  return new TextDecoder().decode(decrypted);
}

export function maskSecret(value?: string) {
  if (!value) return "";
  const suffix = value.slice(-4);
  return `••••${suffix}`;
}

export function parseStoredJson<T>(value: unknown, fallback: T) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
