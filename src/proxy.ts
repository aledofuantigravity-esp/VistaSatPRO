import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

function buildCspHeader(nonce: string, isHttps: boolean): string {
  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'unsafe-inline' 'unsafe-eval'`;

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
    "frame-src 'self' https://*.supabase.co blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (isProd && isHttps) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

/**
 * Proxy SSR (Next.js 16): inyecta CSP estricta con nonce por petición,
 * refresca cookies de sesión de Supabase Auth y aplica control de acceso por estado activo y rol.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isHttps =
    forwardedProto === 'https' || request.nextUrl.protocol === 'https:';
  const cspHeader = buildCspHeader(nonce, isHttps);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', cspHeader);
    return res;
  };

  // Las precargas del enrutador Next.js no necesitan golpear Supabase Auth/BD en cada hover
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('x-middleware-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch';
  if (isPrefetch) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (!isSupabaseConfigured()) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/installations') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/parts') ||
    pathname.startsWith('/users') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/profile');

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return withCsp(NextResponse.redirect(url));
  }

  if (user && (isProtected || pathname === '/login')) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (prof && !prof.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return withCsp(NextResponse.redirect(url));
    }

    if (pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return withCsp(NextResponse.redirect(url));
    }

    if (pathname.startsWith('/users') && prof?.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return withCsp(NextResponse.redirect(url));
    }

    if (
      pathname.startsWith('/reports') &&
      prof?.role !== 'admin' &&
      prof?.role !== 'coordinator'
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return withCsp(NextResponse.redirect(url));
    }
  }

  return withCsp(supabaseResponse);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sw.js|manifest.webmanifest|offline.html|icons/|screenshots/|api/).*)',
  ],
};
