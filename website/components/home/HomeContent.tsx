import { useHomeData } from '../../hooks/useHomeData'
import { HomeHero } from './HomeHero'
import {
  DiceSection,
  HomeCommunityShowcaseSection,
  HomeImageSlotSection,
  HomeStorySections,
} from './sections'

/* ─── Main export ─── */

export function HomeContent({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const isZh = lang === 'zh'
  const { dicePlays, isLoading } = useHomeData()

  return (
    <div className="shadow-page home-shadow-page" style={{ minHeight: '100vh' }}>
      <HomeHero isZh={isZh} />
      <HomeCommunityShowcaseSection isZh={isZh} />
      <HomeStorySections />
      {!isLoading && dicePlays.length > 0 ? (
        <DiceSection plays={dicePlays} isZh={isZh} isLoading={false} />
      ) : null}
      <HomeImageSlotSection />
    </div>
  )
}
