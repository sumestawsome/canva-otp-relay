'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ShieldAlert, LogOut, Mail } from 'lucide-react'

export default function UnauthorizedPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email)
      }
    })
  }, [])

  const handleSignOut = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      await supabase.auth.signOut()
      router.replace('/login')
      router.refresh()
    } catch (err) {
      console.error('Error signing out:', err)
      router.replace('/login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">Akses Ditolak / Unauthorized</h1>
          <p className="text-sm text-slate-400">
            Email Anda tidak terdaftar di daftar whitelist tim (<code className="text-amber-400 font-mono text-xs">allowed_users</code>). Silakan hubungi Administrator untuk meminta akses.
          </p>
        </div>

        {email && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-300 font-mono">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            <span>{email}</span>
          </div>
        )}

        <button
          onClick={handleSignOut}
          disabled={loading}
          className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-200 font-medium rounded-xl border border-slate-700 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>{loading ? 'Keluar...' : 'Keluar / Switch Account'}</span>
        </button>
      </div>
    </main>
  )
}
