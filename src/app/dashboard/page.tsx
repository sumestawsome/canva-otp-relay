'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Copy,
  Check,
  Clock,
  LogOut,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  History,
  Inbox,
  AlertCircle,
} from 'lucide-react'

interface OtpLog {
  id: string
  code: string
  sender: string
  subject: string | null
  gmail_message_id: string
  received_at: string
  expires_at: string
  status: 'active' | 'expired'
}

export default function DashboardPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<OtpLog[]>([])
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<{
    minutes: number
    seconds: number
    isExpired: boolean
  }>({
    minutes: 0,
    seconds: 0,
    isExpired: true,
  })

  // Memoize browser client to prevent re-instantiation across renders
  const supabase = useMemo(() => createClient(), [])

  // Fetch initial OTP logs and current user session
  const fetchInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.email) {
        setUserEmail(user.email)
      }

      const { data, error } = await supabase
        .from('otp_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(5)

      if (error) {
        console.error('Error fetching OTP logs:', error)
      } else if (data) {
        setLogs(data as OtpLog[])
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // Toast Helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }, [])

  // Setup Realtime Listener & Initial Load
  useEffect(() => {
    fetchInitialData()

    // Subscribe to Postgres changes on otp_logs table
    const channel = supabase
      .channel('otp_logs_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'otp_logs',
        },
        (payload) => {
          console.log('[REALTIME EVENT RECEIVED]', payload)
          showToast('⚡ Kode OTP Baru Diterima!')

          if (payload.eventType === 'INSERT') {
            const newRecord = payload.new as OtpLog
            setLogs((prev) => {
              const updated = [
                newRecord,
                ...prev.filter((item) => item.id !== newRecord.id),
              ]
              return updated.slice(0, 5)
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedRecord = payload.new as OtpLog
            setLogs((prev) =>
              prev.map((item) =>
                item.id === updatedRecord.id ? updatedRecord : item
              )
            )
          } else {
            fetchInitialData()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchInitialData, showToast, supabase])

  const latestOtp = logs[0] || null

  // Dynamic Countdown Timer Hook for Latest OTP
  useEffect(() => {
    if (!latestOtp) return

    const updateTimer = () => {
      const expiresTime = new Date(latestOtp.expires_at).getTime()
      const now = new Date().getTime()
      const diff = expiresTime - now

      if (diff <= 0) {
        setTimeLeft({ minutes: 0, seconds: 0, isExpired: true })
      } else {
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setTimeLeft({ minutes, seconds, isExpired: false })
      }
    }

    updateTimer()
    const timerInterval = setInterval(updateTimer, 1000)

    return () => clearInterval(timerInterval)
  }, [latestOtp])

  // Helper for Copy Code
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      showToast('Kode OTP berhasil disalin!')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code', err)
    }
  }

  // Sign Out Handler
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      router.replace('/login')
      router.refresh()
    } catch (err) {
      console.error('Sign out error:', err)
      router.replace('/login')
    }
  }

  const formatTime = (timeIso: string) => {
    try {
      const d = new Date(timeIso)
      return d.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return timeIso
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-violet-500 selection:text-white">
      {/* Top Notification Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-violet-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-violet-400/40 animate-bounce">
          <Sparkles className="w-5 h-5 text-amber-300" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white font-bold shadow-lg shadow-violet-500/20">
              C
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                Canva OTP Relay
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Realtime
                </span>
              </h1>
              <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                {userEmail || 'Internal Team'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchInitialData}
              title="Refresh Data"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition border border-transparent hover:border-slate-700 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-400 px-3 py-2 rounded-xl hover:bg-red-950/30 transition border border-transparent hover:border-red-900/40 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* CARD UTAMA: LATEST OTP */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle Background Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl -z-0 pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                <Sparkles className="w-4 h-4 text-violet-400" />
                Kode OTP Terbaru (Canva)
              </div>

              {latestOtp && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400">Diterima:</span>
                  <span className="font-mono text-slate-200">
                    {formatTime(latestOtp.received_at)}
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400 font-mono">
                  Memuat kode OTP...
                </span>
              </div>
            ) : !latestOtp ? (
              <div className="py-12 text-center space-y-3">
                <Inbox className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-400">Belum ada kode OTP masuk.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* OTP Display Box */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-4 relative">
                  <div className="text-5xl sm:text-7xl font-mono font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-sky-400 drop-shadow">
                    {latestOtp.code}
                  </div>

                  {/* Copy Button */}
                  <button
                    onClick={() => handleCopyCode(latestOtp.code)}
                    className={`mt-2 flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 shadow-lg cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                        : 'bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white shadow-violet-600/30 hover:scale-[1.02]'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Countdown & Status Metadata */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Pengirim:</span>
                    <span className="font-mono text-slate-200 bg-slate-800 px-2 py-1 rounded-md">
                      {latestOtp.sender}
                    </span>
                  </div>

                  {/* Dynamic Countdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Masa berlaku OTP:</span>
                    {timeLeft.isExpired ? (
                      <span className="inline-flex items-center gap-1 font-semibold px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Expired (Kadaluarsa)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-mono font-bold px-3 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                        {String(timeLeft.minutes).padStart(2, '0')}:
                        {String(timeLeft.seconds).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* KOMPONEN HISTORY: 5 OTP TERAKHIR */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-400" />
              Riwayat 5 OTP Terakhir
            </h2>
            <span className="text-xs text-slate-500">Auto-synced</span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              Belum ada data riwayat OTP.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {logs.map((item) => {
                const isItemExpired =
                  new Date(item.expires_at).getTime() < new Date().getTime()
                return (
                  <div
                    key={item.id}
                    className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-800/30 px-2 rounded-xl transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-bold text-slate-200">
                        {item.code}
                      </span>
                      <div className="hidden sm:block text-xs text-slate-400 truncate max-w-[200px]">
                        {item.subject || item.sender}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-slate-400">
                        {formatTime(item.received_at)}
                      </span>

                      {/* Status Badge */}
                      {isItemExpired ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          Expired
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      )}

                      <button
                        onClick={() => handleCopyCode(item.code)}
                        title="Copy OTP Code"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>
            Canva OTP Relay Internal App &bull; Powered by Next.js 15 & Supabase
          </span>
        </div>
      </footer>
    </div>
  )
}
