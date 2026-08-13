import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') ?? undefined;

  const prompts = await prisma.prompt.findMany({
    where: { userId: session!.user.id, ...(projectId ? { projectId } : {}) },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(prompts);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { name, description, content, variables = [], tags = [], projectId } = await req.json();
  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'name and content required' }, { status: 400 });
  }

  const prompt = await prisma.prompt.create({
    data: {
      name: name.trim(),
      description,
      content: content.trim(),
      variables,
      tags,
      userId: session!.user.id,
      projectId: projectId ?? null,
    },
  });

  return NextResponse.json(prompt, { status: 201 });
}
