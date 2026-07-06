import type { ReactNode } from 'react'

export function LegalUpdated({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-medium" style={{ color: 'var(--shadow-text-dim)' }}>
      {children}
    </p>
  )
}
