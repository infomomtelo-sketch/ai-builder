'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
  _count?: { workflows: number; conversations: number };
}

export default function ProjectsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    if (status === 'authenticated') {
      fetch('/api/projects').then((r) => r.json()).then(setProjects).finally(() => setLoading(false));
    }
  }, [status, router]);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    const data = await res.json();
    setProjects((prev) => [data, ...prev]);
    setShowNew(false);
    setNewName('');
    setNewDesc('');
    setCreating(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm block mb-2">← Dashboard</Link>
            <h1 className="text-2xl font-bold">Projects</h1>
          </div>
          <button
            onClick={() => setShowNew(!showNew)}
            className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm transition"
          >
            + New Project
          </button>
        </div>

        {showNew && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <h2 className="font-semibold mb-4">Create Project</h2>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 mb-3"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white resize-none h-20 focus:outline-none focus:border-violet-500 mb-3"
            />
            <div className="flex gap-3">
              <button
                onClick={create}
                disabled={creating || !newName.trim()}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm transition"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-white px-4 py-2 rounded-xl text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-4">No projects yet</p>
            <button onClick={() => setShowNew(true)} className="text-violet-400 hover:text-violet-300 text-sm">Create your first project →</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-violet-700 transition block">
                <h3 className="font-semibold mb-1 truncate">{p.name}</h3>
                {p.description && <p className="text-gray-400 text-sm mb-3 truncate">{p.description}</p>}
                <div className="flex gap-4 text-xs text-gray-500">
                  {p._count && (
                    <>
                      <span>⚡ {p._count.workflows} workflows</span>
                      <span>💬 {p._count.conversations} chats</span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
