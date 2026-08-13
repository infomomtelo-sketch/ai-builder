import { AuthSession, requireAuth } from "./auth";
import { decryptSecret, encryptSecret, Env, estimateTokens, generateId, json, maskSecret, parseStoredJson, readJson } from "./utils";

type Role = "system" | "user" | "assistant";
type Provider = "openai" | "anthropic";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  workflow_count?: number;
  conversation_count?: number;
}

interface WorkflowRow {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  definition: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PromptRow {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  template: string;
  variables: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

interface ConversationRow {
  id: string;
  project_id: string | null;
  title: string | null;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  created_at: string;
}

interface UserSettingsRow {
  default_model: string;
  theme: string;
  api_keys: string;
  preferences: string;
}

interface UserRow {
  id: string;
  github_id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface GeneratePayload {
  projectId?: string | null;
  conversationId?: string | null;
  model?: string;
  messages: Array<{ role: Role; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface UsageResult {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface CompletionResult extends UsageResult {
  content: string;
}

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4.1": { input: 0.005, output: 0.015 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-7-sonnet-20250219": { input: 0.003, output: 0.015 },
  "claude-3-5-haiku-20241022": { input: 0.0008, output: 0.004 },
};

export async function handleApiRequest(request: Request, env: Env, pathname: string) {
  if (pathname === "/api/health") {
    return json({ status: "ok", timestamp: new Date().toISOString() });
  }

  const session = await requireAuth(request, env);
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const segments = pathname.split("/").filter(Boolean);
  const resource = segments[1];
  const resourceId = segments[2];

  switch (resource) {
    case "me":
    case "user":
      return handleUserRequest(request, env, session);
    case "projects":
      return handleProjectsRequest(request, env, session, resourceId);
    case "workflows":
      return handleWorkflowsRequest(request, env, session, resourceId);
    case "prompts":
      return handlePromptsRequest(request, env, session, resourceId);
    case "conversations":
      return handleConversationsRequest(request, env, session, resourceId);
    case "generate":
      return handleGenerateRequest(request, env, session);
    default:
      return json({ error: "Not found" }, { status: 404 });
  }
}

async function handleUserRequest(request: Request, env: Env, session: AuthSession) {
  if (request.method === "GET") {
    return json(await buildUserPayload(env, session.user.id));
  }

  if (request.method !== "PATCH") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await readJson<{
    name?: string;
    bio?: string;
    settings?: {
      defaultModel?: string;
      theme?: string;
      apiKeys?: Record<string, string>;
      preferences?: Record<string, unknown>;
    };
  }>(request);

  await env.DB.prepare("UPDATE users SET name = ?, bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(body.name ?? session.user.name, body.bio ?? null, session.user.id)
    .run();

  const currentSettings = await getUserSettings(env, session.user.id);
  const apiKeys = { ...(currentSettings.apiKeys ?? {}) };
  const incomingKeys = body.settings?.apiKeys ?? {};
  const secret = env.SETTINGS_ENCRYPTION_SECRET ?? env.JWT_SECRET;
  for (const [provider, value] of Object.entries(incomingKeys)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    apiKeys[provider] = await encryptSecret(trimmed, secret);
  }

  await env.DB.prepare(
    `
      INSERT INTO user_settings (user_id, default_model, theme, api_keys, preferences, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        default_model = excluded.default_model,
        theme = excluded.theme,
        api_keys = excluded.api_keys,
        preferences = excluded.preferences,
        updated_at = CURRENT_TIMESTAMP
    `,
  )
    .bind(
      session.user.id,
      body.settings?.defaultModel ?? currentSettings.defaultModel ?? "gpt-4o",
      body.settings?.theme ?? currentSettings.theme ?? "dark",
      JSON.stringify(apiKeys),
      JSON.stringify(body.settings?.preferences ?? currentSettings.preferences ?? {}),
    )
    .run();

  return json(await buildUserPayload(env, session.user.id));
}

async function buildUserPayload(env: Env, userId: string) {
  const user = await env.DB.prepare(
    "SELECT id, github_id, username, email, name, avatar_url, bio FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<UserRow>();

  const settings = await getUserSettings(env, userId);
  const stats =
    (await env.DB.prepare(
      `
        SELECT
          (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS project_count,
          (SELECT COUNT(*) FROM workflows WHERE user_id = ?) AS workflow_count,
          (SELECT COUNT(*) FROM prompts WHERE user_id = ?) AS prompt_count,
          (SELECT COUNT(*) FROM conversations WHERE user_id = ?) AS conversation_count,
          COALESCE((SELECT SUM(input_tokens + output_tokens) FROM messages m
            INNER JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = ?), 0) AS total_tokens,
          COALESCE((SELECT SUM(cost) FROM messages m
            INNER JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = ?), 0) AS total_cost
      `,
    )
      .bind(userId, userId, userId, userId, userId, userId)
      .first<{
        project_count: number;
        workflow_count: number;
        prompt_count: number;
        conversation_count: number;
        total_tokens: number;
        total_cost: number;
      }>()) ?? {
      project_count: 0,
      workflow_count: 0,
      prompt_count: 0,
      conversation_count: 0,
      total_tokens: 0,
      total_cost: 0,
    };

  return {
    user: {
      id: user?.id ?? userId,
      githubId: user?.github_id ?? "",
      username: user?.username ?? "",
      email: user?.email ?? null,
      name: user?.name ?? null,
      avatarUrl: user?.avatar_url ?? null,
      bio: user?.bio ?? null,
    },
    settings: {
      defaultModel: settings.defaultModel,
      theme: settings.theme,
      maskedApiKeys: {
        openai: maskSecret(settings.resolvedApiKeys.openai),
        anthropic: maskSecret(settings.resolvedApiKeys.anthropic),
      },
      hasSharedKeys: {
        openai: Boolean(settings.resolvedApiKeys.openai || env.OPENAI_API_KEY),
        anthropic: Boolean(settings.resolvedApiKeys.anthropic || env.ANTHROPIC_API_KEY),
      },
      preferences: settings.preferences,
    },
    stats: {
      projects: Number(stats.project_count ?? 0),
      workflows: Number(stats.workflow_count ?? 0),
      prompts: Number(stats.prompt_count ?? 0),
      conversations: Number(stats.conversation_count ?? 0),
      totalTokens: Number(stats.total_tokens ?? 0),
      totalCost: Number(stats.total_cost ?? 0),
    },
  };
}

async function handleProjectsRequest(request: Request, env: Env, session: AuthSession, projectId?: string) {
  if (!projectId) {
    if (request.method === "GET") {
      const result = await env.DB.prepare(
        `
          SELECT
            p.*,
            (SELECT COUNT(*) FROM workflows w WHERE w.project_id = p.id) AS workflow_count,
            (SELECT COUNT(*) FROM conversations c WHERE c.project_id = p.id) AS conversation_count
          FROM projects p
          WHERE p.user_id = ?
          ORDER BY p.updated_at DESC
        `,
      )
        .bind(session.user.id)
        .all<ProjectRow>();
      return json(result.results?.map(mapProject) ?? []);
    }

    if (request.method === "POST") {
      const body = await readJson<{ name?: string; description?: string | null }>(request);
      if (!body.name?.trim()) {
        return json({ error: "Project name is required." }, { status: 400 });
      }

      const id = generateId();
      await env.DB.prepare("INSERT INTO projects (id, user_id, name, description) VALUES (?, ?, ?, ?)")
        .bind(id, session.user.id, body.name.trim(), body.description ?? null)
        .run();

      const created = await env.DB.prepare(
        `
          SELECT p.*, 0 AS workflow_count, 0 AS conversation_count
          FROM projects p
          WHERE p.id = ? AND p.user_id = ?
        `,
      )
        .bind(id, session.user.id)
        .first<ProjectRow>();
      return json(mapProject(created!), { status: 201 });
    }
  }

  if (!projectId) return json({ error: "Not found" }, { status: 404 });

  if (request.method === "GET") {
    const row = await env.DB.prepare(
      `
        SELECT
          p.*,
          (SELECT COUNT(*) FROM workflows w WHERE w.project_id = p.id) AS workflow_count,
          (SELECT COUNT(*) FROM conversations c WHERE c.project_id = p.id) AS conversation_count
        FROM projects p
        WHERE p.id = ? AND p.user_id = ?
      `,
    )
      .bind(projectId, session.user.id)
      .first<ProjectRow>();
    return row ? json(mapProject(row)) : json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = await readJson<{ name?: string; description?: string | null }>(request);
    await env.DB.prepare(
      `
        UPDATE projects
        SET name = COALESCE(?, name), description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
    )
      .bind(body.name?.trim() || null, body.description ?? null, projectId, session.user.id)
      .run();
    return handleProjectsRequest(new Request(`${request.url}`, { method: "GET" }), env, session, projectId);
  }

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").bind(projectId, session.user.id).run();
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleWorkflowsRequest(request: Request, env: Env, session: AuthSession, workflowId?: string) {
  if (!workflowId) {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const projectId = url.searchParams.get("projectId");
      const query = projectId
        ? "SELECT * FROM workflows WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC"
        : "SELECT * FROM workflows WHERE user_id = ? ORDER BY updated_at DESC";
      const statement = env.DB.prepare(query);
      const result = projectId
        ? await statement.bind(session.user.id, projectId).all<WorkflowRow>()
        : await statement.bind(session.user.id).all<WorkflowRow>();
      return json(result.results?.map(mapWorkflow) ?? []);
    }

    if (request.method === "POST") {
      const body = await readJson<{
        projectId?: string | null;
        name?: string;
        description?: string | null;
        definition?: Record<string, unknown>;
        status?: string;
      }>(request);
      if (!body.name?.trim()) return json({ error: "Workflow name is required." }, { status: 400 });

      const id = generateId();
      await env.DB.prepare(
        `
          INSERT INTO workflows (id, user_id, project_id, name, description, definition, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
        .bind(
          id,
          session.user.id,
          body.projectId ?? null,
          body.name.trim(),
          body.description ?? null,
          JSON.stringify(body.definition ?? { nodes: [], edges: [] }),
          body.status ?? "draft",
        )
        .run();

      const created = await env.DB.prepare("SELECT * FROM workflows WHERE id = ? AND user_id = ?")
        .bind(id, session.user.id)
        .first<WorkflowRow>();
      return json(mapWorkflow(created!), { status: 201 });
    }
  }

  if (!workflowId) return json({ error: "Not found" }, { status: 404 });

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM workflows WHERE id = ? AND user_id = ?")
      .bind(workflowId, session.user.id)
      .first<WorkflowRow>();
    return row ? json(mapWorkflow(row)) : json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = await readJson<{
      projectId?: string | null;
      name?: string;
      description?: string | null;
      definition?: Record<string, unknown>;
      status?: string;
    }>(request);
    await env.DB.prepare(
      `
        UPDATE workflows
        SET
          project_id = COALESCE(?, project_id),
          name = COALESCE(?, name),
          description = ?,
          definition = COALESCE(?, definition),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
    )
      .bind(
        body.projectId ?? null,
        body.name?.trim() || null,
        body.description ?? null,
        body.definition ? JSON.stringify(body.definition) : null,
        body.status ?? null,
        workflowId,
        session.user.id,
      )
      .run();
    return handleWorkflowsRequest(new Request(request.url, { method: "GET" }), env, session, workflowId);
  }

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM workflows WHERE id = ? AND user_id = ?").bind(workflowId, session.user.id).run();
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handlePromptsRequest(request: Request, env: Env, session: AuthSession, promptId?: string) {
  if (!promptId) {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const projectId = url.searchParams.get("projectId");
      const query = projectId
        ? "SELECT * FROM prompts WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC"
        : "SELECT * FROM prompts WHERE user_id = ? ORDER BY updated_at DESC";
      const statement = env.DB.prepare(query);
      const result = projectId
        ? await statement.bind(session.user.id, projectId).all<PromptRow>()
        : await statement.bind(session.user.id).all<PromptRow>();
      return json(result.results?.map(mapPrompt) ?? []);
    }

    if (request.method === "POST") {
      const body = await readJson<{
        projectId?: string | null;
        name?: string;
        description?: string | null;
        template?: string;
        variables?: string[];
        tags?: string[];
      }>(request);
      if (!body.name?.trim() || !body.template?.trim()) {
        return json({ error: "Prompt name and template are required." }, { status: 400 });
      }

      const id = generateId();
      await env.DB.prepare(
        `
          INSERT INTO prompts (id, user_id, project_id, name, description, template, variables, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
        .bind(
          id,
          session.user.id,
          body.projectId ?? null,
          body.name.trim(),
          body.description ?? null,
          body.template.trim(),
          JSON.stringify(body.variables ?? []),
          JSON.stringify(body.tags ?? []),
        )
        .run();
      const created = await env.DB.prepare("SELECT * FROM prompts WHERE id = ? AND user_id = ?")
        .bind(id, session.user.id)
        .first<PromptRow>();
      return json(mapPrompt(created!), { status: 201 });
    }
  }

  if (!promptId) return json({ error: "Not found" }, { status: 404 });

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM prompts WHERE id = ? AND user_id = ?")
      .bind(promptId, session.user.id)
      .first<PromptRow>();
    return row ? json(mapPrompt(row)) : json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = await readJson<{
      projectId?: string | null;
      name?: string;
      description?: string | null;
      template?: string;
      variables?: string[];
      tags?: string[];
    }>(request);
    await env.DB.prepare(
      `
        UPDATE prompts
        SET
          project_id = COALESCE(?, project_id),
          name = COALESCE(?, name),
          description = ?,
          template = COALESCE(?, template),
          variables = COALESCE(?, variables),
          tags = COALESCE(?, tags),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `,
    )
      .bind(
        body.projectId ?? null,
        body.name?.trim() || null,
        body.description ?? null,
        body.template?.trim() || null,
        body.variables ? JSON.stringify(body.variables) : null,
        body.tags ? JSON.stringify(body.tags) : null,
        promptId,
        session.user.id,
      )
      .run();
    return handlePromptsRequest(new Request(request.url, { method: "GET" }), env, session, promptId);
  }

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM prompts WHERE id = ? AND user_id = ?").bind(promptId, session.user.id).run();
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleConversationsRequest(request: Request, env: Env, session: AuthSession, conversationId?: string) {
  if (!conversationId && request.method === "GET") {
    const result = await env.DB.prepare(
      `
        SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
        FROM conversations c
        WHERE c.user_id = ?
        ORDER BY c.updated_at DESC
      `,
    )
      .bind(session.user.id)
      .all<ConversationRow>();
    return json(result.results?.map(mapConversation) ?? []);
  }

  if (!conversationId) {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (request.method === "GET") {
    const conversation = await env.DB.prepare(
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
    )
      .bind(conversationId, session.user.id)
      .first<ConversationRow>();
    if (!conversation) return json({ error: "Not found" }, { status: 404 });

    const messages = await env.DB.prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
      .bind(conversationId)
      .all<MessageRow>();

    return json({
      ...mapConversation(conversation),
      messages: messages.results?.map(mapMessage) ?? [],
    });
  }

  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?")
      .bind(conversationId, session.user.id)
      .run();
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}

async function handleGenerateRequest(request: Request, env: Env, session: AuthSession) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await readJson<GeneratePayload>(request);
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "messages must be a non-empty array." }, { status: 400 });
  }

  const settings = await getUserSettings(env, session.user.id);
  const model = body.model ?? settings.defaultModel ?? "gpt-4o";
  const provider = getProvider(model);
  const apiKey =
    settings.resolvedApiKeys[provider] ?? (provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY);
  if (!apiKey) {
    return json({ error: `Missing ${provider} API key.` }, { status: 400 });
  }

  const conversation = await findOrCreateConversation(env, session.user.id, {
    id: body.conversationId ?? null,
    projectId: body.projectId ?? null,
    model,
    title: body.messages[body.messages.length - 1]?.content?.slice(0, 80) ?? "New conversation",
  });

  const lastUserMessage = body.messages[body.messages.length - 1];
  if (lastUserMessage?.role === "user") {
    await saveMessage(env, {
      conversationId: conversation.id,
      role: "user",
      content: lastUserMessage.content,
      model,
      inputTokens: estimateTokens(lastUserMessage.content),
      outputTokens: 0,
      cost: 0,
    });
  }

  if (body.stream === false) {
    const result = await completeWithProvider(provider, apiKey, model, body);
    await persistAssistantReply(env, conversation.id, model, result);
    return json({
      conversationId: conversation.id,
      content: result.content,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
      },
    });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (payload: Record<string, unknown>) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };

  (async () => {
    try {
      const result = await completeWithProvider(provider, apiKey, model, body, async (chunk) => {
        await sendEvent({ chunk });
      });
      await persistAssistantReply(env, conversation.id, model, result);
      await sendEvent({
        done: true,
        conversationId: conversation.id,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: result.cost,
        },
      });
    } catch (error) {
      await sendEvent({
        error: error instanceof Error ? error.message : "Unable to generate response.",
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

async function persistAssistantReply(env: Env, conversationId: string, model: string, result: CompletionResult) {
  await saveMessage(env, {
    conversationId,
    role: "assistant",
    content: result.content,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: result.cost,
  });

  await env.DB.prepare(
    `
      UPDATE conversations
      SET
        total_input_tokens = total_input_tokens + ?,
        total_output_tokens = total_output_tokens + ?,
        total_cost = total_cost + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  )
    .bind(result.inputTokens, result.outputTokens, result.cost, conversationId)
    .run();
}

async function saveMessage(
  env: Env,
  message: {
    conversationId: string;
    role: Role;
    content: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  },
) {
  await env.DB.prepare(
    `
      INSERT INTO messages (id, conversation_id, role, content, model, input_tokens, output_tokens, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  )
    .bind(
      generateId(),
      message.conversationId,
      message.role,
      message.content,
      message.model,
      message.inputTokens,
      message.outputTokens,
      message.cost,
    )
    .run();
}

async function findOrCreateConversation(
  env: Env,
  userId: string,
  options: { id: string | null; projectId: string | null; model: string; title: string },
) {
  if (options.id) {
    const existing = await env.DB.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
      .bind(options.id, userId)
      .first<ConversationRow>();
    if (existing) return existing;
  }

  const id = generateId();
  await env.DB.prepare(
    "INSERT INTO conversations (id, user_id, project_id, title, model) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, userId, options.projectId, options.title, options.model)
    .run();

  return (
    (await env.DB.prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .first<ConversationRow>()) as ConversationRow
  );
}

async function getUserSettings(env: Env, userId: string) {
  const row =
    (await env.DB.prepare(
      "SELECT default_model, theme, api_keys, preferences FROM user_settings WHERE user_id = ?",
    )
      .bind(userId)
      .first<UserSettingsRow>()) ?? {
      default_model: "gpt-4o",
      theme: "dark",
      api_keys: "{}",
      preferences: "{}",
    };

  const apiKeys = parseStoredJson<Record<string, string>>(row.api_keys, {});
  const preferences = parseStoredJson<Record<string, unknown>>(row.preferences, {});
  const secret = env.SETTINGS_ENCRYPTION_SECRET ?? env.JWT_SECRET;
  const resolvedApiKeys: Record<string, string> = {};

  for (const [provider, value] of Object.entries(apiKeys)) {
    if (!value) continue;
    try {
      resolvedApiKeys[provider] = await decryptSecret(value, secret);
    } catch {
      resolvedApiKeys[provider] = "";
    }
  }

  return {
    defaultModel: row.default_model,
    theme: row.theme,
    apiKeys,
    resolvedApiKeys,
    preferences,
  };
}

function getProvider(model: string): Provider {
  if (model.startsWith("gpt-")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  throw new Error(`Unsupported model: ${model}`);
}

function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = MODEL_COSTS[model] ?? { input: 0.001, output: 0.002 };
  return Number(((inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output).toFixed(6));
}

async function completeWithProvider(
  provider: Provider,
  apiKey: string,
  model: string,
  body: GeneratePayload,
  onChunk?: (chunk: string) => Promise<void>,
): Promise<CompletionResult> {
  if (provider === "openai") {
    return streamOpenAi(apiKey, model, body, onChunk);
  }

  return streamAnthropic(apiKey, model, body, onChunk);
}

async function streamOpenAi(
  apiKey: string,
  model: string,
  body: GeneratePayload,
  onChunk?: (chunk: string) => Promise<void>,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      max_tokens: body.maxTokens ?? 2048,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || "OpenAI request failed.");
  }

  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of iterateSse(response.body)) {
    if (event.data === "[DONE]") break;
    const payload = JSON.parse(event.data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const chunk = payload.choices?.[0]?.delta?.content ?? "";
    if (chunk) {
      content += chunk;
      await onChunk?.(chunk);
    }
    if (payload.usage) {
      inputTokens = payload.usage.prompt_tokens ?? inputTokens;
      outputTokens = payload.usage.completion_tokens ?? outputTokens;
    }
  }

  if (!inputTokens && !outputTokens) {
    inputTokens = estimateTokens(body.messages.map((message) => message.content).join(" "));
    outputTokens = estimateTokens(content);
  }

  return {
    content,
    inputTokens,
    outputTokens,
    cost: estimateCost(model, inputTokens, outputTokens),
  };
}

async function streamAnthropic(
  apiKey: string,
  model: string,
  body: GeneratePayload,
  onChunk?: (chunk: string) => Promise<void>,
) {
  const system = body.messages.find((message) => message.role === "system")?.content;
  const messages = body.messages.filter((message) => message.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: body.maxTokens ?? 2048,
      system,
      messages,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || "Anthropic request failed.");
  }

  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of iterateSse(response.body)) {
    const payload = JSON.parse(event.data) as {
      type?: string;
      delta?: { type?: string; text?: string };
      message?: { usage?: { input_tokens?: number; output_tokens?: number } };
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta" && payload.delta.text) {
      content += payload.delta.text;
      await onChunk?.(payload.delta.text);
    }

    if (payload.type === "message_start") {
      inputTokens = payload.message?.usage?.input_tokens ?? inputTokens;
    }

    if (payload.type === "message_delta") {
      outputTokens = payload.usage?.output_tokens ?? outputTokens;
    }
  }

  if (!inputTokens && !outputTokens) {
    inputTokens = estimateTokens(body.messages.map((message) => message.content).join(" "));
    outputTokens = estimateTokens(content);
  }

  return {
    content,
    inputTokens,
    outputTokens,
    cost: estimateCost(model, inputTokens, outputTokens),
  };
}

async function* iterateSse(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const segments = buffer.split("\n\n");
    buffer = segments.pop() ?? "";

    for (const segment of segments) {
      const lines = segment.split(/\r?\n/);
      let event = "message";
      const data: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice(6).trim();
        }
        if (line.startsWith("data:")) {
          data.push(line.slice(5).trim());
        }
      }
      if (data.length > 0) {
        yield { event, data: data.join("\n") };
      }
    }
  }
}

function mapProject(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _count: {
      workflows: Number(row.workflow_count ?? 0),
      conversations: Number(row.conversation_count ?? 0),
    },
  };
}

function mapWorkflow(row: WorkflowRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    definition: parseStoredJson<Record<string, unknown>>(row.definition, { nodes: [], edges: [] }),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPrompt(row: PromptRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    template: row.template,
    variables: parseStoredJson<string[]>(row.variables, []),
    tags: parseStoredJson<string[]>(row.tags, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConversation(row: ConversationRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    model: row.model,
    totalInputTokens: Number(row.total_input_tokens ?? 0),
    totalOutputTokens: Number(row.total_output_tokens ?? 0),
    totalCost: Number(row.total_cost ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: Number(row.message_count ?? 0),
  };
}

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    model: row.model,
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    cost: Number(row.cost ?? 0),
    createdAt: row.created_at,
  };
}
