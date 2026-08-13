'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface WorkflowNode {
  id: string;
  type: 'prompt' | 'model' | 'condition' | 'output';
  label: string;
  config: Record<string, string>;
}

export default function WorkflowBuilderPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [name, setName] = useState('My Workflow');
  const [description, setDescription] = useState('');
  const [nodes, setNodes] = useState<WorkflowNode[]>([
    { id: '1', type: 'prompt', label: 'System Prompt', config: { content: 'You are a helpful assistant.' } },
    { id: '2', type: 'model', label: 'LLM Node', config: { model: 'gpt-4o', temperature: '0.7' } },
    { id: '3', type: 'output', label: 'Output', config: { format: 'text' } },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (status === 'loading') return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>;
  if (status === 'unauthenticated') { router.push('/auth/signin'); return null; }

  void session;

  const addNode = (type: WorkflowNode['type']) => {
    const id = String(Date.now());
    setNodes((prev) => [...prev, { id, type, label: TYPE_LABELS[type], config: {} }]);
  };

  const removeNode = (id: string) => setNodes((prev) => prev.filter((n) => n.id !== id));

  const updateNodeConfig = (id: string, key: string, value: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n));
  };

  const saveWorkflow = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, definition: { nodes, edges: buildEdges(nodes) } }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      router.push(`/workflows/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">← Dashboard</Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-transparent border-b border-gray-700 px-2 py-1 text-white font-semibold focus:outline-none focus:border-violet-500 text-lg"
        />
        <div className="flex-1" />
        {error && <span className="text-red-400 text-sm">{error}</span>}
        <button
          onClick={saveWorkflow}
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-5 py-2 rounded-xl text-sm transition"
        >
          {saving ? 'Saving…' : 'Save Workflow'}
        </button>
      </header>

      <div className="flex flex-1">
        <aside className="w-56 border-r border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">Add Node</p>
          {(Object.keys(TYPE_LABELS) as WorkflowNode['type'][]).map((type) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="w-full flex items-center gap-2 px-3 py-2 mb-2 rounded-xl text-sm bg-gray-900 border border-gray-800 hover:border-violet-600 transition text-gray-300"
            >
              <span>{NODE_ICONS[type]}</span> {TYPE_LABELS[type]}
            </button>
          ))}
          <div className="mt-6">
            <label className="text-xs text-gray-500 block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl p-2 text-sm text-white resize-none h-20 focus:outline-none focus:border-violet-500"
              placeholder="Describe this workflow…"
            />
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-8">
          <div className="space-y-4 max-w-2xl mx-auto">
            {nodes.length === 0 && (
              <div className="text-center py-20 text-gray-500">Add nodes from the left panel to build your workflow.</div>
            )}
            {nodes.map((node, idx) => (
              <div key={node.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 relative">
                {idx < nodes.length - 1 && (
                  <div className="absolute left-1/2 -bottom-4 w-px h-4 bg-gray-700" />
                )}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl">{NODE_ICONS[node.type]}</span>
                  <span className="font-medium">{node.label}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-lg text-xs bg-gray-800 text-gray-400">{node.type}</span>
                  <button onClick={() => removeNode(node.id)} className="text-gray-600 hover:text-red-400 transition ml-2 text-lg leading-none">×</button>
                </div>
                <NodeConfig node={node} onUpdate={updateNodeConfig} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

function NodeConfig({ node, onUpdate }: { node: WorkflowNode; onUpdate: (id: string, k: string, v: string) => void }) {
  if (node.type === 'prompt') {
    return (
      <textarea
        value={node.config.content ?? ''}
        onChange={(e) => onUpdate(node.id, 'content', e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white resize-none h-24 focus:outline-none focus:border-violet-500"
        placeholder="Enter prompt…"
      />
    );
  }
  if (node.type === 'model') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Model</label>
          <select
            value={node.config.model ?? 'gpt-4o'}
            onChange={(e) => onUpdate(node.id, 'model', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
          >
            {['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Temperature</label>
          <input
            type="number" min="0" max="2" step="0.1"
            value={node.config.temperature ?? '0.7'}
            onChange={(e) => onUpdate(node.id, 'temperature', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
          />
        </div>
      </div>
    );
  }
  if (node.type === 'condition') {
    return (
      <input
        value={node.config.condition ?? ''}
        onChange={(e) => onUpdate(node.id, 'condition', e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
        placeholder="e.g. output.length > 100"
      />
    );
  }
  if (node.type === 'output') {
    return (
      <select
        value={node.config.format ?? 'text'}
        onChange={(e) => onUpdate(node.id, 'format', e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
      >
        <option value="text">Plain Text</option>
        <option value="json">JSON</option>
        <option value="markdown">Markdown</option>
      </select>
    );
  }
  return null;
}

const TYPE_LABELS: Record<WorkflowNode['type'], string> = {
  prompt: 'Prompt Node',
  model: 'LLM Node',
  condition: 'Condition',
  output: 'Output',
};

const NODE_ICONS: Record<WorkflowNode['type'], string> = {
  prompt: '📝',
  model: '🤖',
  condition: '🔀',
  output: '📤',
};

function buildEdges(nodes: WorkflowNode[]) {
  return nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }));
}
