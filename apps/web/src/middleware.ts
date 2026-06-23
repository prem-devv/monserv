import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — no authentication required
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/status') ||
    pathname === '/api/health' ||
    pathname.startsWith('/auth/signin') ||
    pathname === '/status'
  ) {
    return NextResponse.next();
  }

  // All other /api/* paths require a valid session
  if (pathname.startsWith('/api/')) {
    const token = await getToken({
      req: request,
      secret:
        process.env.NEXTAUTH_SECRET ||
        'default-secret-change-in-production',
    });

    if (!token) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static (static files)
     *  - _next/image (image optimization files)
     *  - favicon.ico
     *  - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
