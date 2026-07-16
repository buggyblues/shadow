import { ArrowRight } from 'lucide-react'
import { useI18n } from 'rspress/runtime'

const DOCS_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
  '/'
).replace(/\/$/, '')

export function HomeCommunityShowcaseSection({ isZh }: { isZh: boolean }) {
  const t = useI18n()
  const discoverHref = `${DOCS_BASE}${isZh ? '/zh' : ''}/spaces.html`

  return (
    <section
      className="home-community-showcase"
      id="community-showcase"
      aria-labelledby="home-community-showcase-title"
    >
      <img
        className="home-community-showcase-background"
        src={`${DOCS_BASE}/home-sections/space-milky-way-2.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      <div className="home-community-showcase-inner">
        <div className="home-community-showcase-copy">
          <p>{t('home.communityShowcase.eyebrow')}</p>
          <h2 id="home-community-showcase-title">{t('home.communityShowcase.title')}</h2>
          <span>{t('home.communityShowcase.description')}</span>
          <a href={discoverHref}>
            {t('home.communityShowcase.action')}
            <ArrowRight aria-hidden="true" size={18} />
          </a>
        </div>

        <figure
          className="home-community-showcase-stack"
          aria-label={t('home.communityShowcase.stackLabel')}
        >
          <img
            className="home-community-showcase-shot is-gaming"
            src={`${DOCS_BASE}/home-assets/community-shots/gaming-channel.webp`}
            alt={t('home.communityShowcase.gamingAlt')}
            loading="lazy"
            decoding="async"
          />
          <img
            className="home-community-showcase-shot is-music"
            src={`${DOCS_BASE}/home-assets/community-shots/music-buddy-inbox.webp`}
            alt={t('home.communityShowcase.musicAlt')}
            loading="lazy"
            decoding="async"
          />
          <img
            className="home-community-showcase-shot is-travel"
            src={`${DOCS_BASE}/home-assets/community-shots/travel-home.webp`}
            alt={t('home.communityShowcase.travelAlt')}
            loading="lazy"
            decoding="async"
          />
        </figure>

        <img
          className="home-community-showcase-sticker"
          src={`${DOCS_BASE}/home-stickers/life_otter_travel.png`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
    </section>
  )
}
