import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const pathname = request.nextUrl.pathname

  // 1. Bypass static files & webhook routes from authentication checks
  if (
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return supabaseResponse
  }

  // 2. Initialize Supabase SSR client for middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. Retrieve authenticated user session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = pathname === '/login'
  const isAuthCallbackPage = pathname === '/auth/callback'
  const isUnauthorizedPage = pathname === '/unauthorized'

  // If user is not authenticated and trying to access protected page
  if (!user) {
    if (!isLoginPage && !isAuthCallbackPage && !isUnauthorizedPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // 4. Verify user email against allowed_users whitelist table
  if (user.email) {
    const { data: allowedUser } = await supabase
      .from('allowed_users')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()

    // If user email is NOT in allowed_users
    if (!allowedUser) {
      if (!isUnauthorizedPage && !isLoginPage && !isAuthCallbackPage) {
        const url = request.nextUrl.clone()
        url.pathname = '/unauthorized'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }
  } else {
    // No email attached to auth user
    if (!isUnauthorizedPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/unauthorized'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // 5. If user is authenticated & authorized, but visits /login -> redirect to /dashboard
  if (isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // If root '/' is visited by authenticated user, redirect to /dashboard
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
