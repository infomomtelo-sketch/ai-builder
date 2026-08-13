import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: session!.user.id },
    include: {
      workflows: { orderBy: { updatedAt: 'desc' } },
      conversations: { orderBy: { updatedAt: 'desc' }, take: 10 },
      prompts: { orderBy: { updatedAt: 'desc' } },
    },
  });

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { name, description } = await req.json();
  const project = await prisma.project.updateMany({
    where: { id: params.id, userId: session!.user.id },
    data: { name, description },
  });

  if (project.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  await prisma.project.deleteMany({ where: { id: params.id, userId: session!.user.id } });
  return NextResponse.json({ success: true });
}
