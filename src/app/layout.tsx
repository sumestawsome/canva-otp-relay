import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Canva OTP Relay - Team Internal',
  description: 'Real-time Canva OTP Relay Dashboard for Internal Team',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id">
      <body className="antialiased bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  )
}
