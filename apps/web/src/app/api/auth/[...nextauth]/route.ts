import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const dynamic = 'force-dynamic';

const isSecure = process.env.NEXTAUTH_URL?.startsWith('https') ?? false;

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Admin Login',
      credentials: {
        username: {
          label: 'Username',
          type: 'text',
          placeholder: 'admin',
        },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (
          credentials?.username === 'admin' &&
          credentials?.password === 'admin'
        ) {
          return {
            id: '1',
            name: 'Admin',
            email: 'admin@monserv.local',
          };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  cookies: {
    sessionToken: {
      name: isSecure
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isSecure,
      },
    },
  },
  secret:
    process.env.NEXTAUTH_SECRET ||
    'default-secret-change-in-production',
});

export { handler as GET, handler as POST };
