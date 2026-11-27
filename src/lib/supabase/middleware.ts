import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/database'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const pathname = request.nextUrl.pathname

  // 1. Bypass static assets, internal Next.js paths, and webhook endpoints
  if (
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return supabaseResponse
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Key is missing in environment variables.')
    return supabaseResponse
  }

  // 2. Initialize Supabase SSR Client for middleware
  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
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

  // Helper to preserve cookies across redirects (preventing session drops)
  const redirectWithCookies = (destinationUrl: URL) => {
    const redirectResponse = NextResponse.redirect(destinationUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
    })
    return redirectResponse
  }

  // 3. Retrieve authenticated user using getUser() (secure server verification)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = pathname === '/login'
  const isAuthCallbackPage = pathname === '/auth/callback'
  const isUnauthorizedPage = pathname === '/unauthorized'

  // Scenario A: User is NOT authenticated
  if (!user) {
    if (!isLoginPage && !isAuthCallbackPage) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return redirectWithCookies(url)
    }
    return supabaseResponse
  }

  // Scenario B: User IS authenticated (Open Access: All authenticated Google sessions can access dashboard)
  // If authenticated user visits /login, /unauthorized, or root '/', redirect to /dashboard
  if (isLoginPage || isUnauthorizedPage || pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return redirectWithCookies(url)
  }

  return supabaseResponse
}
