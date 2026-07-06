import { ArrowRight } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useI18n } from 'rspress/runtime'
import { handleAppEntryClick, serverDesktopUrl } from '../app-entry'
import type { Play } from '../types'

export function ServerEntryCta({
  play,
  isZh = false,
  short = false,
  style,
}: {
  play: Play
  isZh?: boolean
  short?: boolean
  style?: CSSProperties
}) {
  const t = useI18n()
  const ctaStyle: CSSProperties = {
    ...style,
    gap: '8px',
    opacity: 1,
    cursor: 'pointer',
  }

  return (
    <a
      href={serverDesktopUrl(play, isZh)}
      className="btn-primary"
      style={{ ...ctaStyle, textDecoration: 'none' }}
      onClick={handleAppEntryClick}
    >
      <ArrowRight size={short ? 14 : 15} strokeWidth={short ? 2.7 : 2.6} />
      {t(short ? 'home.serverCta.enterShort' : 'home.serverCta.enter')}
    </a>
  )
}
