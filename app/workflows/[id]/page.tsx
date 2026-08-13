'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: string;
  definition: { nodes: unknown[]; edges: unknown[] };
  updatedAt: string;
  executions?: Array<{ id: string; status: string; startedAt: string }>;
}

export default function WorkflowDetailPage({ params }: { params: { id: string } }) {
  const { status } = useSession();
  const router = useRouter();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  useEffect(() => {
    fetch(`/api/workflows/${params.id}`)
      .then((r) => r.json())
      .then((d) => setWorkflow(d))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>;
  if (!workflow || 'error' in (workflow as object)) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400 mb-4">Workflow not found.</p>
        <Link href="/dashboard" className="text-violet-400 hover:text-violet-300">← Dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">← Dashboard</Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{workflow.name}</h1>
            {workflow.description && <p className="text-gray-400 text-sm">{workflow.description}</p>}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            workflow.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'
          }`}>
            {workflow.status}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">Nodes</p>
            <p className="text-2xl font-bold">{workflow.definition.nodes.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">Executions</p>
            <p className="text-2xl font-bold">{workflow.executions?.length ?? 0}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-400 text-xs mb-1">Last updated</p>
            <p className="text-lg font-semibold">{new Date(workflow.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Workflow Definition</h2>
          <pre className="text-sm text-gray-300 overflow-auto bg-gray-950 rounded-xl p-4 max-h-96">
            {JSON.stringify(workflow.definition, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
