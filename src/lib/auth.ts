import type { NextAuthOptions, Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import { getCurrentUserContext } from '@/lib/auth-context';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email ?? '';
      if (!email) return false;

      // Primary path: DB-backed membership/staff lookup via getCurrentUserContext.
      // A user is allowed to sign in if they have ANY membership row (staff or per-project).
      // This replaces the hardcoded @triarchsecurity.com allowlist per MEMBER-03.
      const ctx = await getCurrentUserContext({ user: { email } });
      if (ctx !== null) {
        const allowed = ctx.isStaff || ctx.memberships.length > 0;
        if (allowed) return true;
        // Authenticated user with NO memberships: still fall through to the
        // env-allowlist below. Required during the v1.14 rollout so members
        // get added by the existing admins via the manage-members page.
      }

      // Fallback path: env-allowlist. Used when:
      //   - getCurrentUserContext returned null (DB error — caller logs the err)
      //   - DB returned an empty membership set for an admin not yet seeded
      // Slated for removal in v1.15 once staff seeding is stable.
      return (
        email === process.env.ADMIN_EMAIL ||
        email.toLowerCase().endsWith('@triarchsecurity.com')
      );
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000;
        return token;
      }

      if (typeof token.accessTokenExpires === 'number' && Date.now() < token.accessTokenExpires - 300_000) {
        return token;
      }

      if (token.refreshToken) {
        try {
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              grant_type: 'refresh_token',
              refresh_token: token.refreshToken as string,
            }),
          });

          const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };

          if (data.access_token) {
            token.accessToken = data.access_token;
            token.accessTokenExpires = Date.now() + (data.expires_in ?? 3600) * 1000;
          } else {
            console.error('[auth] Token refresh failed:', data.error);
            token.error = 'RefreshAccessTokenError';
          }
        } catch (err) {
          console.error('[auth] Token refresh error:', err);
          token.error = 'RefreshAccessTokenError';
        }
      }

      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      (session as Session & { accessToken?: string }).accessToken = token.accessToken as string | undefined;
      (session as Session & { error?: string }).error = token.error as string | undefined;
      return session;
    },
  },
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
