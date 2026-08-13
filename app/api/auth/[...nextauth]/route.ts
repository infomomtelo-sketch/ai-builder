import NextAuth, { type NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import prisma from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: { params: { scope: 'read:user user:email' } },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'github' || !profile) return false;
      const ghProfile = profile as {
        id: number;
        login: string;
        avatar_url: string;
        bio?: string;
      };
      await prisma.user.upsert({
        where: { githubId: String(ghProfile.id) },
        create: {
          githubId: String(ghProfile.id),
          username: ghProfile.login,
          name: user.name ?? ghProfile.login,
          email: user.email ?? undefined,
          avatarUrl: ghProfile.avatar_url,
          bio: ghProfile.bio ?? null,
          settings: { create: {} },
        },
        update: {
          username: ghProfile.login,
          name: user.name ?? ghProfile.login,
          email: user.email ?? undefined,
          avatarUrl: ghProfile.avatar_url,
          bio: ghProfile.bio ?? null,
        },
      });
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === 'github' && profile) {
        const ghProfile = profile as { id: number; login: string };
        token.githubId = String(ghProfile.id);
        token.username = ghProfile.login;
        const dbUser = await prisma.user.findUnique({
          where: { githubId: String(ghProfile.id) },
          select: { id: true },
        });
        if (dbUser) token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      if (token.username) session.user.username = token.username as string;
      if (token.githubId) session.user.githubId = token.githubId as string;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
