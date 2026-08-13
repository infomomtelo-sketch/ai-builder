import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const projects = await prisma.project.findMany({
    where: { userId: session!.user.id },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { workflows: true, conversations: true } } },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const project = await prisma.project.create({
    data: { name: name.trim(), description, userId: session!.user.id },
  });

  return NextResponse.json(project, { status: 201 });
}
