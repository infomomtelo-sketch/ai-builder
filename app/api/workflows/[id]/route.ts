import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const workflow = await prisma.workflow.findFirst({
    where: { id: params.id, userId: session!.user.id },
    include: { executions: { orderBy: { startedAt: 'desc' }, take: 10 } },
  });

  if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(workflow);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const updated = await prisma.workflow.updateMany({
    where: { id: params.id, userId: session!.user.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.definition !== undefined && { definition: body.definition }),
      ...(body.status !== undefined && { status: body.status }),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  await prisma.workflow.deleteMany({ where: { id: params.id, userId: session!.user.id } });
  return NextResponse.json({ success: true });
}
