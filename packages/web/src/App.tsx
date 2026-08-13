import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type RouteKey = "dashboard" | "projects" | "workflows" | "prompts" | "chat" | "settings";
type Role = "system" | "user" | "assistant";

interface BootstrapPayload {
  user: {
    id: string;
    githubId: string;
    username: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    bio: string | null;
  };
  settings: {
    defaultModel: string;
    theme: string;
    maskedApiKeys: Record<string, string>;
    hasSharedKeys: Record<string, boolean>;
    preferences: Record<string, unknown>;
  };
  stats: {
    projects: number;
    workflows: number;
    prompts: number;
    conversations: number;
    totalTokens: number;
    totalCost: number;
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    workflows: number;
    conversations: number;
  };
}

interface WorkflowNode {
  id: string;
  type: "prompt" | "model" | "condition" | "output";
  label: string;
  config: Record<string, string>;
}

interface Workflow {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  definition: {
    nodes: WorkflowNode[];
    edges: Array<{ from: string; to: string }>;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PromptTemplate {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  template: string;
  variables: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ConversationMessage {
  id?: string;
  role: Role;
  content: string;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
}

interface Conversation {
  id: string;
  projectId: string | null;
  title: string | null;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  updatedAt: string;
  messageCount: number;
}

const MODELS = [
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet", provider: "Anthropic" },
];

const NODE_TYPES: Array<WorkflowNode["type"]> = ["prompt", "model", "condition", "output"];

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>();
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  const reloadBootstrap = async () => {
    const response = await fetch("/api/me", { credentials: "include" });
    if (!response.ok) {
      setBootstrap(null);
      return;
    }
    setBootstrap((await response.json()) as BootstrapPayload);
  };

  useEffect(() => {
    void reloadBootstrap();
  }, []);

  if (pathname === "/auth/callback") {
    return <AuthCallbackPage onAuthenticated={reloadBootstrap} />;
  }

  if (bootstrap === undefined) {
    return <FullScreenMessage title="Loading AI Builder…" subtitle="Connecting to your Cloudflare workspace." />;
  }

  if (!bootstrap) {
    return <LandingPage />;
  }

  const route = getRoute(pathname);

  return <AuthenticatedApp route={route} bootstrap={bootstrap} onRefresh={reloadBootstrap} />;
}

function LandingPage() {
  return (
    <main className="marketing-shell">
      <section className="hero">
        <span className="pill">Cloudflare Workers + D1 + KV</span>
        <h1>Build, ship, and manage AI workflows from one GitHub-authenticated workspace.</h1>
        <p>
          AI Builder combines GitHub OAuth, reusable prompts, live model streaming, token and cost tracking, and a
          production-ready serverless backend on Cloudflare.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="/api/auth/github">
            Sign in with GitHub
          </a>
          <a className="button secondary" href="/dashboard">
            Open dashboard
          </a>
        </div>
      </section>

      <section className="marketing-grid">
        <MarketingCard
          title="Multi-provider generation"
          text="Switch between GPT-4o and Claude models without leaving your chat, while tracking usage and costs."
        />
        <MarketingCard
          title="Workflow builder"
          text="Create drag-and-drop AI workflows with prompt, model, condition, and output nodes."
        />
        <MarketingCard
          title="Reusable prompts"
          text="Save prompt templates with variables and tags so your team can reuse the best building blocks."
        />
      </section>
    </main>
  );
}

function AuthCallbackPage({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [message, setMessage] = useState("Finishing your GitHub sign-in…");

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      if (error) {
        setMessage(`Sign-in failed: ${error}`);
        return;
      }

      await onAuthenticated();
      window.location.replace("/dashboard");
    };

    void run();
  }, [onAuthenticated]);

  return <FullScreenMessage title={message} subtitle="Please wait while we restore your AI Builder session." />;
}

function AuthenticatedApp({
  route,
  bootstrap,
  onRefresh,
}: {
  route: RouteKey;
  bootstrap: BootstrapPayload;
  onRefresh: () => Promise<void>;
}) {
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.replace("/");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <strong>AI Builder</strong>
            <p>Serverless workspace</p>
          </div>
        </div>

        <nav className="nav-stack">
          {NAV_ITEMS.map((item) => (
            <a key={item.key} className={`nav-link ${route === item.key ? "active" : ""}`} href={item.href}>
              <span>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            {bootstrap.user.avatarUrl ? (
              <img className="avatar" src={bootstrap.user.avatarUrl} alt={bootstrap.user.username} />
            ) : (
              <div className="avatar fallback">{(bootstrap.user.name ?? bootstrap.user.username)[0]}</div>
            )}
            <div>
              <strong>{bootstrap.user.name ?? bootstrap.user.username}</strong>
              <p>{bootstrap.user.email ?? bootstrap.user.username}</p>
            </div>
          </div>
          <button className="button secondary full-width" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content-shell">
        {route === "dashboard" && <DashboardPage bootstrap={bootstrap} />}
        {route === "projects" && <ProjectsPage />}
        {route === "workflows" && <WorkflowsPage />}
        {route === "prompts" && <PromptsPage />}
        {route === "chat" && <ChatPage bootstrap={bootstrap} />}
        {route === "settings" && <SettingsPage bootstrap={bootstrap} onRefresh={onRefresh} />}
      </main>
    </div>
  );
}

function DashboardPage({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    void Promise.all([
      apiJson<Project[]>("/api/projects"),
      apiJson<Workflow[]>("/api/workflows"),
      apiJson<Conversation[]>("/api/conversations"),
    ]).then(([projectData, workflowData, conversationData]) => {
      setProjects(projectData);
      setWorkflows(workflowData);
      setConversations(conversationData);
    });
  }, []);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Overview</span>
          <h1>Welcome back, {bootstrap.user.name ?? bootstrap.user.username}</h1>
          <p>Track project activity, prompt assets, and real-time AI usage in one place.</p>
        </div>
      </header>

      <div className="stats-grid">
        <StatCard label="Projects" value={bootstrap.stats.projects} />
        <StatCard label="Workflows" value={bootstrap.stats.workflows} />
        <StatCard label="Conversations" value={bootstrap.stats.conversations} />
        <StatCard label="Saved prompts" value={bootstrap.stats.prompts} />
        <StatCard label="Tokens tracked" value={bootstrap.stats.totalTokens.toLocaleString()} />
        <StatCard label="Total cost" value={`$${bootstrap.stats.totalCost.toFixed(4)}`} />
      </div>

      <div className="split-grid">
        <Card title="Recent projects" action={<a href="/projects">Manage</a>}>
          {projects.length === 0 ? (
            <EmptyState title="No projects yet" text="Create a project to organize prompts, workflows, and chats." />
          ) : (
            <div className="stack-list">
              {projects.slice(0, 4).map((project) => (
                <Row
                  key={project.id}
                  title={project.name}
                  subtitle={`${project._count.workflows} workflows • ${project._count.conversations} conversations`}
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent workflows" action={<a href="/workflows">Open</a>}>
          {workflows.length === 0 ? (
            <EmptyState title="No workflows saved" text="Build reusable AI flows with drag-and-drop nodes." />
          ) : (
            <div className="stack-list">
              {workflows.slice(0, 4).map((workflow) => (
                <Row key={workflow.id} title={workflow.name} subtitle={`${workflow.status} • ${formatDate(workflow.updatedAt)}`} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Latest conversations" action={<a href="/chat">Open chat</a>}>
        {conversations.length === 0 ? (
          <EmptyState title="No conversation history" text="Start chatting to see streaming usage and model activity here." />
        ) : (
          <div className="stack-list">
            {conversations.slice(0, 6).map((conversation) => (
              <Row
                key={conversation.id}
                title={conversation.title ?? "Untitled conversation"}
                subtitle={`${conversation.model} • ${conversation.messageCount} messages • $${conversation.totalCost.toFixed(4)}`}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProjectsPage() {
  const emptyProject = { name: "", description: "" };
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState(emptyProject);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProjects = async () => {
    setProjects(await apiJson<Project[]>("/api/projects"));
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const saveProject = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
    };

    await fetch(editingId ? `/api/projects/${editingId}` : "/api/projects", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setDraft(emptyProject);
    setEditingId(null);
    setBusy(false);
    await loadProjects();
  };

  const editProject = (project: Project) => {
    setEditingId(project.id);
    setDraft({ name: project.name, description: project.description ?? "" });
  };

  const deleteProject = async (projectId: string) => {
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (editingId === projectId) {
      setEditingId(null);
      setDraft(emptyProject);
    }
    await loadProjects();
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Projects</span>
          <h1>Create and manage AI projects</h1>
          <p>Projects group workflows, prompts, and conversations together for each initiative.</p>
        </div>
      </header>

      <div className="split-grid">
        <Card title={editingId ? "Edit project" : "New project"}>
          <form className="form-stack" onSubmit={saveProject}>
            <Field label="Project name">
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                rows={4}
              />
            </Field>
            <div className="button-row">
              <button className="button primary" disabled={busy || !draft.name.trim()} type="submit">
                {editingId ? "Update project" : "Create project"}
              </button>
              {editingId ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setDraft(emptyProject);
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card title="Project library">
          {projects.length === 0 ? (
            <EmptyState title="No projects yet" text="Create your first project to start organizing AI work." />
          ) : (
            <div className="stack-list">
              {projects.map((project) => (
                <ActionRow
                  key={project.id}
                  title={project.name}
                  subtitle={`${project.description ?? "No description"} • ${project._count.workflows} workflows • ${project._count.conversations} chats`}
                  primaryLabel="Edit"
                  onPrimary={() => editProject(project)}
                  secondaryLabel="Delete"
                  onSecondary={() => void deleteProject(project.id)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function WorkflowsPage() {
  const blankNodes: WorkflowNode[] = [
    { id: makeId(), type: "prompt", label: "System Prompt", config: { content: "You are a helpful AI assistant." } },
    { id: makeId(), type: "model", label: "Model", config: { model: "gpt-4o", temperature: "0.7" } },
    { id: makeId(), type: "output", label: "Output", config: { format: "text" } },
  ];

  const [projects, setProjects] = useState<Project[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("AI Workflow");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [projectId, setProjectId] = useState<string>("");
  const [nodes, setNodes] = useState<WorkflowNode[]>(blankNodes);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = async () => {
    const [projectData, workflowData] = await Promise.all([
      apiJson<Project[]>("/api/projects"),
      apiJson<Workflow[]>("/api/workflows"),
    ]);
    setProjects(projectData);
    setWorkflows(workflowData);
    if (!selectedId && workflowData[0]) {
      hydrateWorkflow(workflowData[0]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const hydrateWorkflow = (workflow: Workflow | null) => {
    if (!workflow) {
      setSelectedId(null);
      setName("AI Workflow");
      setDescription("");
      setStatus("draft");
      setProjectId("");
      setNodes(blankNodes);
      return;
    }

    setSelectedId(workflow.id);
    setName(workflow.name);
    setDescription(workflow.description ?? "");
    setStatus(workflow.status);
    setProjectId(workflow.projectId ?? "");
    setNodes(workflow.definition.nodes.length ? workflow.definition.nodes : blankNodes);
  };

  const addNode = (type: WorkflowNode["type"]) => {
    setNodes((current) => [...current, createNode(type)]);
  };

  const updateNode = (nodeId: string, key: string, value: string) => {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, config: { ...node.config, [key]: value } } : node)),
    );
  };

  const reorderNodes = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setNodes((current) => {
      const cloned = [...current];
      const fromIndex = cloned.findIndex((node) => node.id === draggingId);
      const toIndex = cloned.findIndex((node) => node.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const [item] = cloned.splice(fromIndex, 1);
      cloned.splice(toIndex, 0, item);
      return cloned;
    });
  };

  const saveWorkflow = async () => {
    const payload = {
      projectId: projectId || null,
      name,
      description: description || null,
      status,
      definition: {
        nodes,
        edges: nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id })),
      },
    };

    await fetch(selectedId ? `/api/workflows/${selectedId}` : "/api/workflows", {
      method: selectedId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await load();
  };

  const deleteWorkflow = async (workflowId: string) => {
    await fetch(`/api/workflows/${workflowId}`, { method: "DELETE" });
    hydrateWorkflow(null);
    await load();
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Workflow builder</span>
          <h1>Drag, reorder, and save AI workflows</h1>
          <p>Chain prompts, models, conditions, and outputs into reusable automation flows.</p>
        </div>
      </header>

      <div className="split-grid">
        <Card title="Saved workflows" action={<button className="button secondary" onClick={() => hydrateWorkflow(null)}>New</button>}>
          {workflows.length === 0 ? (
            <EmptyState title="No workflows saved" text="Start with the editor on the right to create your first flow." />
          ) : (
            <div className="stack-list">
              {workflows.map((workflow) => (
                <ActionRow
                  key={workflow.id}
                  title={workflow.name}
                  subtitle={`${workflow.status} • ${formatDate(workflow.updatedAt)}`}
                  primaryLabel="Load"
                  onPrimary={() => hydrateWorkflow(workflow)}
                  secondaryLabel="Delete"
                  onSecondary={() => void deleteWorkflow(workflow.id)}
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Workflow editor">
          <div className="form-stack">
            <Field label="Workflow name">
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
            </Field>
            <div className="two-column-grid">
              <Field label="Project">
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
            </div>

            <div className="button-row">
              {NODE_TYPES.map((type) => (
                <button key={type} className="button secondary" type="button" onClick={() => addNode(type)}>
                  + {type}
                </button>
              ))}
            </div>

            <div className="workflow-canvas">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="workflow-node"
                  draggable
                  onDragStart={() => setDraggingId(node.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorderNodes(node.id)}
                >
                  <div className="node-header">
                    <strong>{node.label}</strong>
                    <button className="icon-button" onClick={() => setNodes((current) => current.filter((item) => item.id !== node.id))}>
                      ×
                    </button>
                  </div>
                  <NodeEditor node={node} onChange={updateNode} />
                </div>
              ))}
            </div>

            <button className="button primary" onClick={saveWorkflow}>
              {selectedId ? "Update workflow" : "Save workflow"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PromptsPage() {
  const emptyPrompt = {
    projectId: "",
    name: "",
    description: "",
    template: "",
    variables: "",
    tags: "",
  };

  const [projects, setProjects] = useState<Project[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [draft, setDraft] = useState(emptyPrompt);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const [projectData, promptData] = await Promise.all([
      apiJson<Project[]>("/api/projects"),
      apiJson<PromptTemplate[]>("/api/prompts"),
    ]);
    setProjects(projectData);
    setPrompts(promptData);
  };

  useEffect(() => {
    void load();
  }, []);

  const savePrompt = async (event: FormEvent) => {
    event.preventDefault();
    await fetch(editingId ? `/api/prompts/${editingId}` : "/api/prompts", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: draft.projectId || null,
        name: draft.name,
        description: draft.description || null,
        template: draft.template,
        variables: splitList(draft.variables),
        tags: splitList(draft.tags),
      }),
    });
    setDraft(emptyPrompt);
    setEditingId(null);
    await load();
  };

  const editPrompt = (prompt: PromptTemplate) => {
    setEditingId(prompt.id);
    setDraft({
      projectId: prompt.projectId ?? "",
      name: prompt.name,
      description: prompt.description ?? "",
      template: prompt.template,
      variables: prompt.variables.join(", "),
      tags: prompt.tags.join(", "),
    });
  };

  const deletePrompt = async (promptId: string) => {
    await fetch(`/api/prompts/${promptId}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Prompt manager</span>
          <h1>Save reusable prompt templates</h1>
          <p>Store prompts with variables and tags so teams can reuse proven AI building blocks.</p>
        </div>
      </header>

      <div className="split-grid">
        <Card title={editingId ? "Edit prompt" : "New prompt"}>
          <form className="form-stack" onSubmit={savePrompt}>
            <Field label="Prompt name">
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Project">
              <select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}>
                <option value="">Shared across projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <Field label="Template">
              <textarea value={draft.template} onChange={(event) => setDraft({ ...draft, template: event.target.value })} rows={6} />
            </Field>
            <Field label="Variables (comma separated)">
              <input value={draft.variables} onChange={(event) => setDraft({ ...draft, variables: event.target.value })} />
            </Field>
            <Field label="Tags (comma separated)">
              <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
            </Field>
            <div className="button-row">
              <button className="button primary" type="submit">
                {editingId ? "Update prompt" : "Save prompt"}
              </button>
              {editingId ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setDraft(emptyPrompt);
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Card>

        <Card title="Prompt library">
          {prompts.length === 0 ? (
            <EmptyState title="No prompts saved" text="Create a prompt template and reuse it from the chat composer." />
          ) : (
            <div className="stack-list">
              {prompts.map((prompt) => (
                <ActionRow
                  key={prompt.id}
                  title={prompt.name}
                  subtitle={`${prompt.variables.join(", ") || "No variables"} • ${prompt.tags.join(", ") || "No tags"}`}
                  primaryLabel="Edit"
                  onPrimary={() => editPrompt(prompt)}
                  secondaryLabel="Delete"
                  onSecondary={() => void deletePrompt(prompt.id)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ChatPage({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const conversationIdFromUrl = useMemo(() => new URLSearchParams(window.location.search).get("id"), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(conversationIdFromUrl);
  const [projectId, setProjectId] = useState("");
  const [model, setModel] = useState(bootstrap.settings.defaultModel || MODELS[0].id);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful AI builder assistant.");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void Promise.all([
      apiJson<Project[]>("/api/projects"),
      apiJson<PromptTemplate[]>("/api/prompts"),
      apiJson<Conversation[]>("/api/conversations"),
    ]).then(([projectData, promptData, conversationData]) => {
      setProjects(projectData);
      setPrompts(promptData);
      setConversations(conversationData);
    });
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void apiJson<{ messages: ConversationMessage[]; model: string; projectId: string | null }>(`/api/conversations/${conversationId}`).then(
      (conversation) => {
        setMessages(conversation.messages);
        setModel(conversation.model);
        setProjectId(conversation.projectId ?? "");
      },
    );
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const applyPrompt = (promptId: string) => {
    setSelectedPromptId(promptId);
    const prompt = prompts.find((item) => item.id === promptId);
    if (prompt) {
      setInput(prompt.template);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const nextUserMessage: ConversationMessage = { role: "user", content: input.trim() };
    const requestMessages = [
      ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt.trim() }] : []),
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: input.trim() },
    ];

    setMessages((current) => [...current, nextUserMessage, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectId || null,
        conversationId,
        model,
        messages: requestMessages,
      }),
    });

    if (!response.ok || !response.body) {
      setMessages((current) => [
        ...current.slice(0, -1),
        { role: "assistant", content: "Unable to generate a response right now." },
      ]);
      setSending(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistant = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((entry) => entry.startsWith("data: "))
          ?.slice(6);
        if (!line) continue;
        const payload = JSON.parse(line) as {
          chunk?: string;
          done?: boolean;
          error?: string;
          conversationId?: string;
          usage?: { inputTokens: number; outputTokens: number; cost: number };
        };

        if (payload.error) {
          assistant = payload.error;
        }

        if (payload.chunk) {
          assistant += payload.chunk;
        }

        setMessages((current) => {
          const updated = [...current];
          updated[updated.length - 1] = { role: "assistant", content: assistant };
          return updated;
        });

        if (payload.done) {
          setConversationId(payload.conversationId ?? conversationId);
          if (payload.conversationId) {
            window.history.replaceState({}, "", `/chat?id=${payload.conversationId}`);
          }
          setMessages((current) => {
            const updated = [...current];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistant,
              inputTokens: payload.usage?.inputTokens,
              outputTokens: payload.usage?.outputTokens,
              cost: payload.usage?.cost,
            };
            return updated;
          });
          const latestConversations = await apiJson<Conversation[]>("/api/conversations");
          setConversations(latestConversations);
        }
      }
    }

    setSending(false);
  };

  return (
    <div className="page-stack chat-page">
      <header className="page-header compact">
        <div>
          <span className="eyebrow">Streaming chat</span>
          <h1>Generate AI content in real time</h1>
          <p>Switch providers, reuse prompts, and track token usage per assistant message.</p>
        </div>
      </header>

      <div className="chat-layout">
        <Card title="Recent conversations">
          {conversations.length === 0 ? (
            <EmptyState title="No conversations yet" text="Start chatting to save model history and token usage." />
          ) : (
            <div className="stack-list">
              {conversations.map((conversation) => (
                <a key={conversation.id} className="resource-link" href={`/chat?id=${conversation.id}`}>
                  <strong>{conversation.title ?? "Untitled"}</strong>
                  <span>
                    {conversation.model} • {conversation.messageCount} messages • ${conversation.totalCost.toFixed(4)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </Card>

        <Card title="AI chat workspace">
          <div className="form-stack">
            <div className="three-column-grid">
              <Field label="Model">
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {MODELS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} ({item.provider})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project">
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">Standalone chat</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Saved prompt">
                <select value={selectedPromptId} onChange={(event) => applyPrompt(event.target.value)}>
                  <option value="">Insert a template</option>
                  {prompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>
                      {prompt.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="System prompt">
              <textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} rows={3} />
            </Field>

            <div className="chat-thread">
              {messages.length === 0 ? (
                <EmptyState title="How can AI Builder help?" text="Ask for code, content, planning, or workflow ideas." />
              ) : (
                messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                    <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
                    <pre>{message.content}</pre>
                    {message.cost ? (
                      <small>
                        {message.inputTokens ?? 0} input • {message.outputTokens ?? 0} output • $
                        {message.cost.toFixed(5)}
                      </small>
                    ) : null}
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            <Field label="Message">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={4}
                placeholder="Ask for content, code, analysis, or a workflow step…"
              />
            </Field>
            <div className="button-row">
              <button className="button primary" disabled={sending || !input.trim()} onClick={sendMessage}>
                {sending ? "Streaming…" : "Send message"}
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setConversationId(null);
                  setMessages([]);
                  window.history.replaceState({}, "", "/chat");
                }}
              >
                New chat
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsPage({
  bootstrap,
  onRefresh,
}: {
  bootstrap: BootstrapPayload;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState(bootstrap.user.name ?? bootstrap.user.username);
  const [bio, setBio] = useState(bootstrap.user.bio ?? "");
  const [defaultModel, setDefaultModel] = useState(bootstrap.settings.defaultModel);
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [status, setStatus] = useState("");

  const save = async () => {
    await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        bio,
        settings: {
          defaultModel,
          apiKeys: {
            openai: openaiKey,
            anthropic: anthropicKey,
          },
        },
      }),
    });

    setOpenaiKey("");
    setAnthropicKey("");
    setStatus("Saved.");
    await onRefresh();
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Profile, keys, and model defaults</h1>
          <p>Manage your display profile, default model, and optional provider credentials.</p>
        </div>
      </header>

      <div className="split-grid">
        <Card title="Profile">
          <div className="form-stack">
            <Field label="Display name">
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Bio">
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={4} />
            </Field>
          </div>
        </Card>

        <Card title="Model preferences">
          <div className="form-stack">
            <Field label="Default model">
              <select value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)}>
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`OpenAI key ${bootstrap.settings.maskedApiKeys.openai ? `(${bootstrap.settings.maskedApiKeys.openai})` : ""}`}>
              <input
                type="password"
                value={openaiKey}
                placeholder="Leave blank to keep existing key"
                onChange={(event) => setOpenaiKey(event.target.value)}
              />
            </Field>
            <Field
              label={`Anthropic key ${
                bootstrap.settings.maskedApiKeys.anthropic ? `(${bootstrap.settings.maskedApiKeys.anthropic})` : ""
              }`}
            >
              <input
                type="password"
                value={anthropicKey}
                placeholder="Leave blank to keep existing key"
                onChange={(event) => setAnthropicKey(event.target.value)}
              />
            </Field>
            <button className="button primary" onClick={save}>
              Save settings
            </button>
            {status ? <p className="status-text">{status}</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function NodeEditor({ node, onChange }: { node: WorkflowNode; onChange: (id: string, key: string, value: string) => void }) {
  if (node.type === "prompt") {
    return <textarea rows={4} value={node.config.content ?? ""} onChange={(event) => onChange(node.id, "content", event.target.value)} />;
  }

  if (node.type === "model") {
    return (
      <div className="two-column-grid">
        <select value={node.config.model ?? "gpt-4o"} onChange={(event) => onChange(node.id, "model", event.target.value)}>
          {MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
        <input
          value={node.config.temperature ?? "0.7"}
          onChange={(event) => onChange(node.id, "temperature", event.target.value)}
          placeholder="Temperature"
        />
      </div>
    );
  }

  if (node.type === "condition") {
    return <input value={node.config.condition ?? ""} onChange={(event) => onChange(node.id, "condition", event.target.value)} />;
  }

  return (
    <select value={node.config.format ?? "text"} onChange={(event) => onChange(node.id, "format", event.target.value)}>
      <option value="text">Plain text</option>
      <option value="markdown">Markdown</option>
      <option value="json">JSON</option>
    </select>
  );
}

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Row({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="row">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  );
}

function ActionRow({
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  title: string;
  subtitle: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <div className="row">
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="button-row">
        <button className="button secondary" onClick={onPrimary}>
          {primaryLabel}
        </button>
        <button className="button ghost" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function FullScreenMessage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="fullscreen-message">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function MarketingCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="card marketing-card">
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

async function apiJson<T>(url: string) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }
  return (await response.json()) as T;
}

function getRoute(pathname: string): RouteKey {
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/workflows")) return "workflows";
  if (pathname.startsWith("/prompts")) return "prompts";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}

function splitList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function createNode(type: WorkflowNode["type"]): WorkflowNode {
  const id = makeId();
  if (type === "prompt") return { id, type, label: "Prompt", config: { content: "" } };
  if (type === "model") return { id, type, label: "Model", config: { model: "gpt-4o", temperature: "0.7" } };
  if (type === "condition") return { id, type, label: "Condition", config: { condition: "" } };
  return { id, type, label: "Output", config: { format: "text" } };
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const NAV_ITEMS: Array<{ key: RouteKey; href: string; label: string; icon: string }> = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { key: "projects", href: "/projects", label: "Projects", icon: "📁" },
  { key: "workflows", href: "/workflows", label: "Workflows", icon: "⚡" },
  { key: "prompts", href: "/prompts", label: "Prompts", icon: "🧠" },
  { key: "chat", href: "/chat", label: "Chat", icon: "💬" },
  { key: "settings", href: "/settings", label: "Settings", icon: "⚙️" },
];
