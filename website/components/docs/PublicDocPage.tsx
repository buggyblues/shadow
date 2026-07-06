import type { ReactNode } from 'react'
import { PublicFooter } from '../layout/PublicFooter'
import type { Lang } from './types'

export function PublicDocPage({
  lang,
  title,
  children,
}: {
  lang: Lang
  title: ReactNode
  children: ReactNode
}) {
  return (
    <div className="shadow-page" style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}>
      <section className="pt-10 pb-20 px-8 md:px-16 max-w-4xl mx-auto">
        <h1 className="zcool text-4xl md:text-5xl mb-8">{title}</h1>
        <div className="prose max-w-none space-y-6" style={{ color: 'var(--shadow-text-muted)' }}>
          {children}
        </div>
      </section>
      <PublicFooter lang={lang} />
    </div>
  )
}
