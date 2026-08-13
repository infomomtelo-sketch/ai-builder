import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '../api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { DashboardClient } from './DashboardClient';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const [projects, conversations, workflows] = await Promise.all([
    prisma.project.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { _count: { select: { workflows: true, conversations: true } } },
    }),
    prisma.conversation.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { _count: { select: { messages: true } } },
    }),
    prisma.workflow.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ]);

  const stats = await prisma.message.aggregate({
    where: { conversation: { userId: session.user.id } },
    _sum: { tokens: true, cost: true },
    _count: true,
  });

  return (
    <DashboardClient
      user={session.user}
      projects={projects}
      conversations={conversations}
      workflows={workflows}
      stats={{
        totalMessages: stats._count,
        totalTokens: stats._sum.tokens ?? 0,
        totalCost: stats._sum.cost ?? 0,
      }}
    />
  );
}
