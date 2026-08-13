import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    include: { settings: true },
  });

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const { name, bio, settings } = body;

  if (name !== undefined || bio !== undefined) {
    await prisma.user.update({
      where: { id: session!.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
      },
    });
  }

  if (settings !== undefined) {
    await prisma.userSettings.upsert({
      where: { userId: session!.user.id },
      create: { userId: session!.user.id, ...settings },
      update: settings,
    });
  }

  return NextResponse.json({ success: true });
}
