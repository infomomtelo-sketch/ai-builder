'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

interface DashboardProps {
  user: { id?: string; name?: string | null; email?: string | null; image?: string | null; username?: string };
  projects: Array<{ id: string; name: string; description?: string | null; updatedAt: Date; _count: { workflows: number; conversations: number } }>;
  conversations: Array<{ id: string; title?: string | null; model: string; updatedAt: Date; _count: { messages: number } }>;
  workflows: Array<{ id: string; name: string; status: string; updatedAt: Date }>;
  stats: { totalMessages: number; totalTokens: number; totalCost: number };
}

export function DashboardClient({ user, projects, conversations, workflows, stats }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'conversations' | 'workflows'>('overview');

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 flex flex-col p-4 shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-sm font-bold">
            AI
          </div>
          <span className="font-bold text-lg">AI Builder</span>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as typeof activeTab)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                activeTab === item.id ? 'bg-violet-600/20 text-violet-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
          <Link
            href="/chat"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition"
          >
            <span>💬</span>
            New Chat
          </Link>
          <Link
            href="/workflows/new"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition"
          >
            <span>⚡</span>
            New Workflow
          </Link>
        </nav>

        {/* User */}
        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center gap-3 px-2 mb-3">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={user.name ?? 'User'} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">
                {(user.name ?? user.email ?? 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.name ?? user.username}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <Link href="/settings" className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition">
            <span>⚙️</span> Settings
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 hover:text-red-400 transition"
          >
            <span>🚪</span> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        {activeTab === 'overview' && (
          <div>
            <div className="mb-8">
              <h1 className="text-2xl font-bold">Welcome back, {user.name ?? user.username ?? 'there'} 👋</h1>
              <p className="text-gray-400 mt-1">Here&apos;s what&apos;s happening in your AI workspace.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatCard label="Total Messages" value={stats.totalMessages.toLocaleString()} icon="💬" />
              <StatCard label="Tokens Used" value={formatTokens(stats.totalTokens)} icon="🔢" />
              <StatCard label="Total Cost" value={`$${stats.totalCost.toFixed(4)}`} icon="💰" />
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <Link href="/chat" className="bg-violet-600 hover:bg-violet-500 transition rounded-2xl p-6 flex items-center gap-4">
                <span className="text-3xl">💬</span>
                <div>
                  <p className="font-semibold text-lg">New Chat</p>
                  <p className="text-violet-200 text-sm">Start a conversation with AI</p>
                </div>
              </Link>
              <Link href="/workflows/new" className="bg-gray-800 hover:bg-gray-700 transition rounded-2xl p-6 flex items-center gap-4">
                <span className="text-3xl">⚡</span>
                <div>
                  <p className="font-semibold text-lg">New Workflow</p>
                  <p className="text-gray-400 text-sm">Build an AI automation pipeline</p>
                </div>
              </Link>
            </div>

            {/* Recent projects */}
            <Section title="Recent Projects" link="/projects" linkText="View all">
              {projects.length === 0 ? (
                <EmptyState message="No projects yet" actionHref="/projects" actionText="Create a project" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition">
                      <p className="font-medium truncate mb-1">{p.name}</p>
                      {p.description && <p className="text-gray-400 text-sm truncate mb-3">{p.description}</p>}
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>⚡ {p._count.workflows} workflows</span>
                        <span>💬 {p._count.conversations} chats</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            {/* Recent Conversations */}
            <Section title="Recent Conversations" link="/chat" linkText="View all" className="mt-8">
              {conversations.length === 0 ? (
                <EmptyState message="No conversations yet" actionHref="/chat" actionText="Start chatting" />
              ) : (
                <div className="space-y-2">
                  {conversations.map((c) => (
                    <Link key={c.id} href={`/chat?id=${c.id}`} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition">
                      <span className="text-xl">💬</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{c.title ?? 'Untitled'}</p>
                        <p className="text-xs text-gray-500">{c.model} · {c._count.messages} messages</p>
                      </div>
                      <span className="text-xs text-gray-600">{formatDate(c.updatedAt)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}

        {activeTab === 'projects' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Projects</h1>
              <Link href="/projects/new" className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm transition">
                + New Project
              </Link>
            </div>
            {projects.length === 0 ? (
              <EmptyState message="No projects yet" actionHref="/projects/new" actionText="Create your first project" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-violet-700 transition">
                    <p className="font-semibold mb-1">{p.name}</p>
                    {p.description && <p className="text-gray-400 text-sm mb-3">{p.description}</p>}
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>⚡ {p._count.workflows}</span>
                      <span>💬 {p._count.conversations}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'conversations' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Conversations</h1>
              <Link href="/chat" className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm transition">
                + New Chat
              </Link>
            </div>
            {conversations.length === 0 ? (
              <EmptyState message="No conversations yet" actionHref="/chat" actionText="Start a conversation" />
            ) : (
              <div className="space-y-2">
                {conversations.map((c) => (
                  <Link key={c.id} href={`/chat?id=${c.id}`} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition">
                    <span className="text-xl">💬</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.title ?? 'Untitled'}</p>
                      <p className="text-xs text-gray-500">{c.model} · {c._count.messages} messages</p>
                    </div>
                    <span className="text-xs text-gray-600">{formatDate(c.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'workflows' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Workflows</h1>
              <Link href="/workflows/new" className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm transition">
                + New Workflow
              </Link>
            </div>
            {workflows.length === 0 ? (
              <EmptyState message="No workflows yet" actionHref="/workflows/new" actionText="Create your first workflow" />
            ) : (
              <div className="space-y-2">
                {workflows.map((w) => (
                  <Link key={w.id} href={`/workflows/${w.id}`} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition">
                    <span className="text-xl">⚡</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{w.name}</p>
                      <p className="text-xs text-gray-500">Status: {w.status}</p>
                    </div>
                    <span className="text-xs text-gray-600">{formatDate(w.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'overview', icon: '🏠', label: 'Overview' },
  { id: 'projects', icon: '📁', label: 'Projects' },
  { id: 'conversations', icon: '💬', label: 'Conversations' },
  { id: 'workflows', icon: '⚡', label: 'Workflows' },
];

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-gray-400 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function Section({
  title, link, linkText, children, className = '',
}: {
  title: string; link: string; linkText: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link href={link} className="text-violet-400 hover:text-violet-300 text-sm transition">{linkText} →</Link>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message, actionHref, actionText }: { message: string; actionHref: string; actionText: string }) {
  return (
    <div className="text-center py-12 text-gray-500">
      <p className="mb-4">{message}</p>
      <Link href={actionHref} className="text-violet-400 hover:text-violet-300 text-sm">{actionText} →</Link>
    </div>
  );
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}
