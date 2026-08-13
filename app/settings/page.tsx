'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface UserProfile {
  name?: string;
  bio?: string;
  email?: string;
  username?: string;
  avatarUrl?: string;
  settings?: {
    defaultModel?: string;
    theme?: string;
    apiKeys?: Record<string, string>;
  };
}

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [defaultModel, setDefaultModel] = useState('gpt-4o');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'api' | 'preferences'>('profile');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
    if (status === 'authenticated') {
      fetch('/api/user').then((r) => r.json()).then((d: UserProfile) => {
        setProfile(d);
        setName(d.name ?? '');
        setBio(d.bio ?? '');
        setDefaultModel(d.settings?.defaultModel ?? 'gpt-4o');
        setOpenaiKey(d.settings?.apiKeys?.openai ?? '');
        setAnthropicKey(d.settings?.apiKeys?.anthropic ?? '');
      });
    }
  }, [status, router]);

  const save = async () => {
    setSaving(true);
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        bio,
        settings: {
          defaultModel,
          apiKeys: { openai: openaiKey, anthropic: anthropicKey },
        },
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (status === 'loading' || !profile) return <div className="min-h-screen bg-gray-950 text-gray-400 flex items-center justify-center">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">← Dashboard</Link>
          <h1 className="text-2xl font-bold flex-1">Settings</h1>
          {saved && <span className="text-green-400 text-sm">✓ Saved</span>}
          <button
            onClick={save}
            disabled={saving}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm transition"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['profile', 'api', 'preferences'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm transition capitalize ${
                activeTab === tab ? 'bg-violet-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                {session?.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="Avatar" className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-violet-600 flex items-center justify-center text-xl font-bold">
                    {(name || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold">{profile.username}</p>
                  <p className="text-gray-400 text-sm">{profile.email}</p>
                </div>
              </div>

              <Field label="Display Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </Field>

              <Field label="Bio">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white resize-none h-24 focus:outline-none focus:border-violet-500"
                  placeholder="Tell us about yourself…"
                />
              </Field>

              <div className="pt-4 border-t border-gray-800">
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="text-red-400 hover:text-red-300 text-sm transition"
                >
                  Sign out of AI Builder
                </button>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm mb-6">
                Add your own API keys to use your provider accounts directly. Keys are stored encrypted and never shared.
              </p>

              <Field label="OpenAI API Key">
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                />
              </Field>

              <Field label="Anthropic API Key">
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 font-mono"
                />
              </Field>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-4">
              <Field label="Default AI Model">
                <select
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}
