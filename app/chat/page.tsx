'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', provider: 'Anthropic' },
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  cost?: number;
}

function ChatContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams?.get('id');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [isLoading, setIsLoading] = useState(false);
  const [currentConvId, setCurrentConvId] = useState<string | null>(conversationId ?? null);
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant.');
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin');
  }, [status, router]);

  useEffect(() => {
    if (conversationId) loadConversation(conversationId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages.map((m: { role: string; content: string; tokens?: number; cost?: number }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        tokens: m.tokens,
        cost: m.cost,
      })));
      setModel(data.model);
    }
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage.content },
    ];

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: allMessages, conversationId: currentConvId, stream: true }),
      });

      if (!res.ok) throw new Error('Failed to generate response');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n').filter((l) => l.startsWith('data: '));

        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.chunk) {
            assistantContent += data.chunk;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
              return updated;
            });
          }
          if (data.done) {
            setCurrentConvId(data.conversationId);
            if (!conversationId) {
              router.replace(`/chat?id=${data.conversationId}`, { scroll: false });
            }
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: assistantContent,
                tokens: data.usage?.outputTokens,
                cost: data.usage?.cost,
              };
              return updated;
            });
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-sm">← Dashboard</Link>
        <div className="flex-1" />

        {/* Model selector */}
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label} ({m.provider})</option>
          ))}
        </select>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-gray-400 hover:text-white transition p-2 rounded-xl hover:bg-gray-800"
          title="Settings"
        >
          ⚙️
        </button>

        <button
          onClick={() => { setMessages([]); setCurrentConvId(null); router.replace('/chat', { scroll: false }); }}
          className="text-gray-400 hover:text-white transition text-sm px-3 py-1.5 rounded-xl hover:bg-gray-800"
        >
          New chat
        </button>
      </header>

      {/* System prompt panel */}
      {showSettings && (
        <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-3">
          <label className="text-xs text-gray-400 block mb-1">System prompt</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white resize-none h-20 focus:outline-none focus:border-violet-500"
          />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-6 space-y-6 max-w-4xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-20">
            <div className="text-5xl mb-4">🤖</div>
            <p className="text-lg font-medium text-gray-300 mb-2">How can I help you today?</p>
            <p className="text-sm">Ask me anything — code, analysis, writing, and more.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-3xl rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-800 text-gray-100'
            }`}>
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{msg.content}</pre>
              {msg.tokens && (
                <p className="text-xs opacity-50 mt-1">{msg.tokens} tokens · ${msg.cost?.toFixed(5)}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message AI Builder… (Enter to send, Shift+Enter for new line)"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-white text-sm resize-none h-14 focus:outline-none focus:border-violet-500 transition"
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 rounded-2xl transition font-medium"
          >
            {isLoading ? '…' : '→'}
          </button>
        </div>
        <p className="text-xs text-gray-600 text-center mt-2">
          {session?.user?.name} · {model} · AI can make mistakes.
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatContent />
    </Suspense>
  );
}
