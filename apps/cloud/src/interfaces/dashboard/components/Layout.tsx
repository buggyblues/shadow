import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Toaster } from './Toaster'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="dashboard-root relative flex min-h-screen"
      style={{ background: 'var(--nf-bg-core)', color: 'var(--nf-text-high)' }}
    >
      <Sidebar />
      <main className="flex-1 overflow-auto relative z-10">{children}</main>
      <Toaster />
    </div>
  )
}
