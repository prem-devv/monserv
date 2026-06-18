import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow next-auth calls, public status data, and health checks
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/status') ||
    pathname === '/api/health'
  ) {
    return NextResponse.next();
  }

  // Restrict all other API access to authenticated users
  if (pathname.startsWith('/api/')) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production',
    });

    if (!token) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
