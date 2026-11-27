import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'

export function createClient() {
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

  return createBrowserClient<Database>(cleanUrl, cleanKey)
}
