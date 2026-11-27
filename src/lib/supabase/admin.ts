import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
  }

  // Sanitize: trim whitespace, strip accidental surrounding quotes, strip trailing slashes
  const cleanUrl = supabaseUrl.trim().replace(/^['"]|['"]$/g, '').replace(/\/+$/, '')
  const cleanKey = serviceRoleKey.trim().replace(/^['"]|['"]$/g, '')

  return createClient<Database>(cleanUrl, cleanKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
