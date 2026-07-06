import { useHomeData } from '../../hooks/useHomeData'
import { HomeHero } from './HomeHero'
import { DiceSection, HomeImageSlotSection, HomeStorySections } from './sections'

/* ─── Main export ─── */

export function HomeContent({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const isZh = lang === 'zh'
  const { dicePlays, isLoading } = useHomeData()

  return (
    <div className="shadow-page home-shadow-page" style={{ minHeight: '100vh' }}>
      <HomeHero isZh={isZh} />
      <HomeStorySections />
      <DiceSection plays={dicePlays} isZh={isZh} isLoading={isLoading} />
      <HomeImageSlotSection />
    </div>
  )
}
