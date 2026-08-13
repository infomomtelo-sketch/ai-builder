import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, userId: session!.user.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(conversation);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  await prisma.conversation.deleteMany({ where: { id: params.id, userId: session!.user.id } });
  return NextResponse.json({ success: true });
}
