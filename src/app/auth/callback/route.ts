import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  // Determine base URL dynamically (supports local dev and production on Vercel)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const isLocalEnv = process.env.NODE_ENV === 'development'

  let baseUrl = requestUrl.origin
  if (!isLocalEnv && forwardedHost) {
    baseUrl = `${forwardedProto}://${forwardedHost}`
  } else if (!isLocalEnv && process.env.NEXT_PUBLIC_APP_URL) {
    baseUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }

  // Handle OAuth provider error (e.g. user canceled Google login)
  if (error || errorDescription) {
    const errorMsg = encodeURIComponent(
      errorDescription || error || 'Gagal login dengan Google.'
    )
    return NextResponse.redirect(`${baseUrl}/login?error=${errorMsg}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      // Retrieve and verify authenticated user session from Supabase Auth
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // OPEN ACCESS: All authenticated Google users are granted access to dashboard
        const cleanNext = next.startsWith('/') ? next : `/${next}`
        return NextResponse.redirect(`${baseUrl}${cleanNext}`)
      }
    } else {
      console.error('[AUTH CALLBACK ERROR]', exchangeError)
      return NextResponse.redirect(
        `${baseUrl}/login?error=${encodeURIComponent(
          exchangeError.message || 'Gagal menukar kode otentikasi.'
        )}`
      )
    }
  }

  return NextResponse.redirect(
    `${baseUrl}/login?error=${encodeURIComponent('Kode otentikasi tidak valid atau sudah kadaluarsa.')}`
  )
}
