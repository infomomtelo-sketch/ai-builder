/**
 * API route handler for Cloudflare Workers.
 *
 * All routes require a valid JWT passed as:  Authorization: ******
 *
 * Routes:
 *   POST /api/generate               – code/workflow generation stub
 *   GET  /api/projects               – list user's projects
 *   POST /api/projects               – create a project
 *   GET  /api/projects/:id           – get project detail
 *   POST /api/projects/:id/workflows – create workflow for project
 */

import { Env } from "./index";
import { verifyJwt, generateId } from "./utils";

export async function handleApi(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  // Authenticate every API request
  const payload = await verifyJwt(request, env.JWT_SECRET);
  if (!payload) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate that the session still exists in KV
  const session = await env.SESSIONS.get(`session:${payload.sub}`);
  if (!session) {
    return Response.json({ error: "Session expired" }, { status: 401 });
  }

  const method = request.method;
  const path = url.pathname;

  // POST /api/generate
  if (path === "/api/generate" && method === "POST") {
    const body = (await request.json()) as { prompt?: string };
    return Response.json({
      message: "Code generation placeholder",
      prompt: body.prompt ?? "",
      generatedCode: "// TODO: integrate LLM provider",
    });
  }

  // GET /api/projects
  if (path === "/api/projects" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, name, description, created_at FROM projects WHERE owner_id = ? ORDER BY created_at DESC"
    )
      .bind(payload.sub)
      .all<{ id: string; name: string; description: string; created_at: string }>();
    return Response.json(results);
  }

  // POST /api/projects
  if (path === "/api/projects" && method === "POST") {
    const body = (await request.json()) as { name?: string; description?: string };
    if (!body.name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    const id = generateId();
    await env.DB.prepare(
      "INSERT INTO projects (id, owner_id, name, description) VALUES (?, ?, ?, ?)"
    )
      .bind(id, payload.sub, body.name, body.description ?? null)
      .run();
    return Response.json(
      { id, name: body.name, description: body.description },
      { status: 201 }
    );
  }

  // GET /api/projects/:id
  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch && method === "GET") {
    const project = await env.DB.prepare(
      "SELECT id, name, description, created_at FROM projects WHERE id = ? AND owner_id = ?"
    )
      .bind(projectMatch[1], payload.sub)
      .first<{ id: string; name: string; description: string; created_at: string }>();
    if (!project) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(project);
  }

  // POST /api/projects/:id/workflows
  const workflowMatch = path.match(/^\/api\/projects\/([^/]+)\/workflows$/);
  if (workflowMatch && method === "POST") {
    const projectId = workflowMatch[1];
    // Verify project ownership
    const project = await env.DB.prepare(
      "SELECT id FROM projects WHERE id = ? AND owner_id = ?"
    )
      .bind(projectId, payload.sub)
      .first<{ id: string }>();
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    const body = (await request.json()) as { name?: string; definition?: object };
    if (!body.name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    const id = generateId();
    await env.DB.prepare(
      "INSERT INTO workflows (id, project_id, name, definition) VALUES (?, ?, ?, ?)"
    )
      .bind(id, projectId, body.name, JSON.stringify(body.definition ?? {}))
      .run();
    return Response.json({ id, projectId, name: body.name }, { status: 201 });
  }

  return Response.json({ error: "Not Found" }, { status: 404 });
}
