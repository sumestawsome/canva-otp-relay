'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ShieldAlert, LogOut } from 'lucide-react'

export default function UnauthorizedPage() {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
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
            Email Anda tidak terdaftar di daftar whitelist tim (`allowed_users`). Silakan hubungi Administrator untuk meminta akses.
          </p>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-slate-200 font-medium rounded-xl border border-slate-700 transition flex items-center justify-center gap-2 text-sm"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar / Switch Account</span>
        </button>
      </div>
    </main>
  )
}
