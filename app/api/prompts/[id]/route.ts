import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const prompt = await prisma.prompt.findFirst({
    where: { id: params.id, userId: session!.user.id },
  });

  if (!prompt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(prompt);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const updated = await prisma.prompt.updateMany({
    where: { id: params.id, userId: session!.user.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.variables !== undefined && { variables: body.variables }),
      ...(body.tags !== undefined && { tags: body.tags }),
    },
  });

  if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  await prisma.prompt.deleteMany({ where: { id: params.id, userId: session!.user.id } });
  return NextResponse.json({ success: true });
}
