import type { ReactNode } from 'react'
import { PublicFooter } from '../layout/PublicFooter'
import type { Lang } from './types'

export function BlogComingSoonPage({
  lang,
  title,
  subtitle,
  badge,
  message,
}: {
  lang: Lang
  title: ReactNode
  subtitle: ReactNode
  badge: ReactNode
  message: ReactNode
}) {
  return (
    <div className="shadow-page" style={{ fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif" }}>
      <section className="pt-10 pb-20 px-8 md:px-16 max-w-4xl mx-auto text-center">
        <h1 className="zcool text-4xl md:text-6xl mb-6 leading-tight">{title}</h1>
        <p
          className="text-lg md:text-xl font-bold max-w-2xl mx-auto mb-12"
          style={{ color: 'var(--shadow-text-muted)' }}
        >
          {subtitle}
        </p>
        <div className="glass-card rounded-3xl p-12">
          <p className="text-6xl mb-6">📝</p>
          <h2 className="zcool text-2xl mb-4">{badge}</h2>
          <p className="font-medium" style={{ color: 'var(--shadow-text-muted)' }}>
            {message}
          </p>
        </div>
      </section>
      <PublicFooter lang={lang} />
    </div>
  )
}
