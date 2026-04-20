import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Toaster } from './Toaster'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-root relative flex h-full min-h-screen">
      {/* Atmosphere orbs — ambient depth matching web quality */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div
          className="absolute top-[-180px] left-[8%] w-[520px] h-[520px] rounded-full blur-[130px] opacity-[0.13]"
          style={{ background: 'radial-gradient(circle, #00F3FF 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-[30%] right-[-120px] w-[580px] h-[580px] rounded-full blur-[130px] opacity-[0.09]"
          style={{ background: 'radial-gradient(circle, #FF2A55 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-80px] left-[35%] w-[420px] h-[420px] rounded-full blur-[110px] opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #7C4DFF 0%, transparent 70%)' }}
        />
      </div>
      <Sidebar />
      <main className="flex-1 overflow-auto relative z-10">{children}</main>
      <Toaster />
    </div>
  )
}
