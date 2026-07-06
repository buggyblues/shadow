import type { ReactNode } from 'react'

export function LegalExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-cyan-500 hover:text-cyan-600"
      style={{ textDecoration: 'none' }}
    >
      {children}
    </a>
  )
}
