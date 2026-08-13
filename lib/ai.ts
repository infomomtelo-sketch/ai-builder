// AI Builder Core — multi-model LLM abstraction, streaming, token counting

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type ModelProvider = 'openai' | 'anthropic' | 'gemini' | 'mistral';

export interface CompletionOptions {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  apiKey?: string;
}

export interface CompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

// Cost per 1K tokens in USD (approximate)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] ?? { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

export function getProvider(model: string): ModelProvider {
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'gemini';
  return 'mistral';
}

export async function streamCompletion(
  options: CompletionOptions,
  onChunk: (chunk: string) => void,
): Promise<CompletionResult> {
  const provider = getProvider(options.model);

  if (provider === 'openai') {
    return streamOpenAI(options, onChunk);
  } else if (provider === 'anthropic') {
    return streamAnthropic(options, onChunk);
  }
  throw new Error(`Provider not yet supported: ${provider}`);
}

async function streamOpenAI(
  options: CompletionOptions,
  onChunk: (chunk: string) => void,
): Promise<CompletionResult> {
  const client = new OpenAI({ apiKey: options.apiKey ?? process.env.OPENAI_API_KEY });
  const systemMsg = options.messages.find((m) => m.role === 'system');
  const userMsgs = options.messages.filter((m) => m.role !== 'system');

  const stream = await client.chat.completions.create({
    model: options.model,
    messages: [
      ...(systemMsg ? [{ role: 'system' as const, content: systemMsg.content }] : []),
      ...userMsgs.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  });

  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      content += delta;
      onChunk(delta);
    }
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens;
      outputTokens = chunk.usage.completion_tokens;
    }
  }

  // Approximate token count if not provided
  if (inputTokens === 0) {
    const allText = options.messages.map((m) => m.content).join(' ');
    inputTokens = Math.ceil(allText.length / 4);
    outputTokens = Math.ceil(content.length / 4);
  }

  return { content, inputTokens, outputTokens, cost: estimateCost(options.model, inputTokens, outputTokens) };
}

async function streamAnthropic(
  options: CompletionOptions,
  onChunk: (chunk: string) => void,
): Promise<CompletionResult> {
  const client = new Anthropic({ apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY });
  const systemMsg = options.messages.find((m) => m.role === 'system')?.content;
  const msgs = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const stream = client.messages.stream({
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    system: systemMsg,
    messages: msgs,
  });

  let content = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      content += chunk.delta.text;
      onChunk(chunk.delta.text);
    }
  }

  const finalMsg = await stream.finalMessage();
  const inputTokens = finalMsg.usage.input_tokens;
  const outputTokens = finalMsg.usage.output_tokens;

  return { content, inputTokens, outputTokens, cost: estimateCost(options.model, inputTokens, outputTokens) };
}

// Simple in-memory context manager for RAG-style conversation memory
export class ContextManager {
  private context: Map<string, Array<{ role: string; content: string; timestamp: number }>> = new Map();

  addMessage(conversationId: string, role: string, content: string) {
    const msgs = this.context.get(conversationId) ?? [];
    msgs.push({ role, content, timestamp: Date.now() });
    // Keep last 50 messages per conversation
    if (msgs.length > 50) msgs.splice(0, msgs.length - 50);
    this.context.set(conversationId, msgs);
  }

  getMessages(conversationId: string, limit = 20) {
    const msgs = this.context.get(conversationId) ?? [];
    return msgs.slice(-limit).map(({ role, content }) => ({ role, content }));
  }

  clearContext(conversationId: string) {
    this.context.delete(conversationId);
  }
}

export const contextManager = new ContextManager();
