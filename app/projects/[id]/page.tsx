'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description?: string;
  workflows: Array<{ id: string; name: string; status: string }>;
  conversations: Array<{ id: string; title?: string; model: string }>;
  prompts: Array<{ id: string; name: string }>;
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { status } = useSession();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    if (status === 'authenticated') {
      fetch(`/api/projects/${params.id}`).then((r) => r.json()).then(setProject).finally(() => setLoading(false));
    }
  }, [status, router, params.id]);

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>;
  if (!project || 'error' in (project as object)) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400 mb-4">Project not found.</p>
        <Link href="/projects" className="text-violet-400 hover:text-violet-300">← Projects</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/projects" className="text-gray-400 hover:text-white transition text-sm">← Projects</Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && <p className="text-gray-400 text-sm">{project.description}</p>}
          </div>
          <Link href={`/chat?projectId=${project.id}`} className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm transition">
            + New Chat
          </Link>
          <Link href={`/workflows/new?projectId=${project.id}`} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm transition">
            + New Workflow
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">Workflows</p>
            <p className="text-2xl font-bold">{project.workflows.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">Conversations</p>
            <p className="text-2xl font-bold">{project.conversations.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">Saved Prompts</p>
            <p className="text-2xl font-bold">{project.prompts.length}</p>
          </div>
        </div>

        {project.workflows.length > 0 && (
          <Section title="Workflows">
            {project.workflows.map((w) => (
              <Link key={w.id} href={`/workflows/${w.id}`} className="flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition mb-2">
                <span>⚡</span>
                <span className="flex-1 font-medium">{w.name}</span>
                <span className="text-xs text-gray-500">{w.status}</span>
              </Link>
            ))}
          </Section>
        )}

        {project.conversations.length > 0 && (
          <Section title="Conversations" className="mt-6">
            {project.conversations.map((c) => (
              <Link key={c.id} href={`/chat?id=${c.id}`} className="flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition mb-2">
                <span>💬</span>
                <span className="flex-1 font-medium">{c.title ?? 'Untitled'}</span>
                <span className="text-xs text-gray-500">{c.model}</span>
              </Link>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}
