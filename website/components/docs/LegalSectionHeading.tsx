import type { ReactNode } from 'react'

export function LegalSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="zcool text-2xl mt-8 mb-4" style={{ color: 'var(--shadow-text)' }}>
      {children}
    </h2>
  )
}
