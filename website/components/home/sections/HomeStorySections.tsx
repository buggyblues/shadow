import type { CSSProperties } from 'react'
import { useI18n } from 'rspress/runtime'

const DOCS_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
  '/'
).replace(/\/$/, '')

const stickerAsset = (name: string) => `${DOCS_BASE}/home-stickers/${name}`
const sectionBackgroundAsset = (name: string) => `${DOCS_BASE}/home-sections/${name}`

const STICKERS = {
  educationMouse: 'education_mouse_notebook.png',
  educationOwl: 'education_owl_book.png',
  gameFox: 'game_fox_controller.png',
  gamePanda: 'game_panda_boardgame.png',
  lifeDeer: 'life_deer_painter.png',
  lifeHedgehog: 'life_hedgehog_plant.png',
  lifeOtter: 'life_otter_travel.png',
  lifeRabbit: 'life_rabbit_noodles.png',
  musicFrog: 'music_frog_conductor.png',
  musicFox: 'music_fox_violin.png',
  techRaccoon: 'tech_raccoon_laptop.png',
  techRedPanda: 'tech_red_panda_telescope.png',
} as const

const SECTION_BACKGROUNDS = {
  deepStars: 'space-milky-way-2.png',
  nebulaRiver: 'space-earth-horizon-2.png',
  planetClose: 'space-planet-left-2.png',
  ringedPlanet: 'space-ringed-planet-2.png',
} as const

type StickerName = keyof typeof STICKERS
type SectionBackgroundName = keyof typeof SECTION_BACKGROUNDS

type StickerPlacement = {
  name: StickerName
  x: string
  y: string
  width: string
  rotate?: string
  delay?: string
}

type StorySection = {
  id: string
  titleKey: string
  descriptionKey: string
  background: SectionBackgroundName
  backgroundPosition: string
  promo: StickerPlacement
  decorations: StickerPlacement[]
  reverse?: boolean
}

const STORY_SECTIONS: StorySection[] = [
  {
    id: 'desktop',
    titleKey: 'home.story.desktop.title',
    descriptionKey: 'home.story.desktop.description',
    background: 'planetClose',
    backgroundPosition: 'center center',
    promo: { name: 'techRaccoon', x: '28%', y: '15%', width: '328px', rotate: '-4deg' },
    decorations: [
      { name: 'educationOwl', x: '6%', y: '54%', width: '138px', rotate: '-8deg', delay: '-1.8s' },
      { name: 'lifeHedgehog', x: '71%', y: '18%', width: '128px', rotate: '8deg', delay: '-0.7s' },
      { name: 'gameFox', x: '74%', y: '62%', width: '120px', rotate: '5deg', delay: '-2.4s' },
    ],
  },
  {
    id: 'channels',
    titleKey: 'home.story.channels.title',
    descriptionKey: 'home.story.channels.description',
    background: 'ringedPlanet',
    backgroundPosition: 'center center',
    promo: { name: 'lifeOtter', x: '30%', y: '11%', width: '292px', rotate: '3deg' },
    decorations: [
      {
        name: 'educationMouse',
        x: '8%',
        y: '12%',
        width: '118px',
        rotate: '-6deg',
        delay: '-1.4s',
      },
      { name: 'musicFox', x: '75%', y: '46%', width: '132px', rotate: '5deg', delay: '-2.2s' },
      { name: 'gamePanda', x: '12%', y: '66%', width: '138px', rotate: '3deg', delay: '-0.5s' },
    ],
    reverse: true,
  },
  {
    id: 'activities',
    titleKey: 'home.story.activities.title',
    descriptionKey: 'home.story.activities.description',
    background: 'deepStars',
    backgroundPosition: 'center center',
    promo: { name: 'gameFox', x: '34%', y: '9%', width: '288px', rotate: '5deg' },
    decorations: [
      { name: 'lifeRabbit', x: '7%', y: '54%', width: '132px', rotate: '-6deg', delay: '-1.1s' },
      { name: 'lifeDeer', x: '75%', y: '13%', width: '126px', rotate: '7deg', delay: '-1.9s' },
      { name: 'musicFrog', x: '73%', y: '66%', width: '124px', rotate: '-8deg', delay: '-0.6s' },
    ],
  },
  {
    id: 'platform',
    titleKey: 'home.story.platform.title',
    descriptionKey: 'home.story.platform.description',
    background: 'nebulaRiver',
    backgroundPosition: 'center center',
    promo: { name: 'techRedPanda', x: '28%', y: '15%', width: '314px', rotate: '-3deg' },
    decorations: [
      { name: 'educationOwl', x: '72%', y: '48%', width: '136px', rotate: '6deg', delay: '-2s' },
      { name: 'educationMouse', x: '9%', y: '18%', width: '96px', rotate: '7deg', delay: '-1.2s' },
      { name: 'lifeHedgehog', x: '10%', y: '66%', width: '120px', rotate: '-4deg', delay: '-0.4s' },
    ],
    reverse: true,
  },
]

function StickerImage({
  placement,
  variant,
}: {
  placement: StickerPlacement
  variant: 'decor' | 'promo'
}) {
  const style = {
    '--sticker-delay': placement.delay || '0s',
    '--sticker-rotate': placement.rotate || '0deg',
    '--sticker-width': placement.width,
    '--sticker-x': placement.x,
    '--sticker-y': placement.y,
  } as CSSProperties

  return (
    <img
      className={`home-story-sticker home-story-sticker-${variant}`}
      src={stickerAsset(STICKERS[placement.name])}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      style={style}
    />
  )
}

export function HomeStorySections() {
  const t = useI18n()

  return (
    <div className="home-story-sections" aria-label={t('home.story.aria')}>
      {STORY_SECTIONS.map((section) => {
        const titleId = `home-story-${section.id}`
        const sectionStyle = {
          '--story-bg-position': section.backgroundPosition,
        } as CSSProperties

        return (
          <section
            className={`home-story-section home-story-section-${section.id}${
              section.reverse ? ' is-reverse' : ''
            }`}
            aria-labelledby={titleId}
            key={section.id}
            style={sectionStyle}
          >
            <img
              className="home-story-background"
              src={sectionBackgroundAsset(SECTION_BACKGROUNDS[section.background])}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            <div className="home-story-section-inner">
              <div className="home-story-copy">
                <h2 id={titleId}>{t(section.titleKey)}</h2>
                <p>{t(section.descriptionKey)}</p>
              </div>
              <div className="home-story-art" aria-hidden="true">
                <StickerImage placement={section.promo} variant="promo" />
                {section.decorations.map((placement) => (
                  <StickerImage
                    key={`${section.id}:${placement.name}`}
                    placement={placement}
                    variant="decor"
                  />
                ))}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
