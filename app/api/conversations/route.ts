import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') ?? undefined;

  const conversations = await prisma.conversation.findMany({
    where: { userId: session!.user.id, ...(projectId ? { projectId } : {}) },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json(conversations);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { title, model = 'gpt-4o', projectId } = await req.json();

  const conversation = await prisma.conversation.create({
    data: {
      title: title ?? 'New conversation',
      model,
      userId: session!.user.id,
      projectId: projectId ?? null,
    },
  });

  return NextResponse.json(conversation, { status: 201 });
}
