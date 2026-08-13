import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { streamCompletion, getProvider } from '@/lib/ai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!rateLimit(session.user.id, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const body = await req.json();
  const { model = 'gpt-4o', messages, conversationId, projectId, stream: doStream = true } = body;

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 });
  }

  // Retrieve or create conversation
  let conversation;
  if (conversationId) {
    conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: session.user.id },
    });
  }
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        model,
        userId: session.user.id,
        projectId: projectId ?? null,
        title: messages[messages.length - 1]?.content?.slice(0, 60) ?? 'New conversation',
      },
    });
  }

  // Save user message
  const userMsg = messages[messages.length - 1];
  if (userMsg?.role === 'user') {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: userMsg.content,
        model,
      },
    });
  }

  // Check provider is valid
  try {
    getProvider(model);
  } catch {
    return NextResponse.json({ error: 'Unsupported model' }, { status: 400 });
  }

  if (doStream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let result;
        try {
          result = await streamCompletion({ model, messages }, (chunk) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'AI error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
          controller.close();
          return;
        }

        // Save assistant message
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: result.content,
            tokens: result.inputTokens + result.outputTokens,
            cost: result.cost,
            model,
          },
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              conversationId: conversation.id,
              usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, cost: result.cost },
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });

    return new NextResponse(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  // Non-streaming path
  let result;
  try {
    result = await streamCompletion({ model, messages, stream: false }, () => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AI error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: result.content,
      tokens: result.inputTokens + result.outputTokens,
      cost: result.cost,
      model,
    },
  });

  return NextResponse.json({
    content: result.content,
    conversationId: conversation.id,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, cost: result.cost },
  });
}
