import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !rawKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or Supabase Anon/Publishable Key.'
    )
  }

  // Sanitize: trim whitespace, strip accidental surrounding quotes, strip trailing slashes
  const cleanUrl = supabaseUrl.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')
  const cleanKey = rawKey.trim().replace(/^['"]|['"]$/g, '')

  return createServerClient<Database>(
    cleanUrl,
    cleanKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  )
}
