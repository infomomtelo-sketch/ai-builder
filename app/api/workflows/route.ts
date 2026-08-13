import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') ?? undefined;

  const workflows = await prisma.workflow.findMany({
    where: { userId: session!.user.id, ...(projectId ? { projectId } : {}) },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { executions: true } } },
  });

  return NextResponse.json(workflows);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { name, description, definition, projectId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const workflow = await prisma.workflow.create({
    data: {
      name: name.trim(),
      description,
      definition: definition ?? { nodes: [], edges: [] },
      userId: session!.user.id,
      projectId: projectId ?? null,
    },
  });

  return NextResponse.json(workflow, { status: 201 });
}
