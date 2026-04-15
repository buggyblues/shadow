import { useEffect, useRef, useState } from 'react'

/* ─── Data ─── */

interface Play {
  id: string
  image: string // picsum.photos URL
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  starts: string
  accentColor: string // for badge
  hot?: boolean
}

const PLAYS: Play[] = [
  {
    id: 'retire-buddy',
    image: 'https://picsum.photos/seed/retire/600/360',
    title: '退休助手',
    titleEn: 'RetireBuddy',
    desc: '帮你规划退休生活、财务自由路径，24小时温暖陪伴，让告别职场变成人生新章节。',
    descEn: 'Plan your retirement and path to financial freedom with a warm 24/7 companion.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '24.5k',
    accentColor: 'var(--shadow-accent)',
    hot: true,
  },
  {
    id: 'financial-freedom',
    image: 'https://picsum.photos/seed/finance/600/360',
    title: '我财富自由了吗？',
    titleEn: 'Am I Free?',
    desc: '输入你的资产与支出，AI 为你计算财务自由距离，给出清晰的达成路线图。',
    descEn: 'Input your assets and expenses—get your financial freedom score and roadmap.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '18.2k',
    accentColor: '#f8e71c',
    hot: true,
  },
  {
    id: 'brain-fix',
    image: 'https://picsum.photos/seed/brain/600/360',
    title: '一分钟修复你的大脑！',
    titleEn: '1-Min Brain Fix',
    desc: '科学冥想 + 微呼吸练习，60秒内从焦虑模式切换到专注状态，屡试不爽。',
    descEn: 'Science-backed micro-meditation. Switch from anxious to focused in 60 seconds.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '15.9k',
    accentColor: '#a78bfa',
  },
  {
    id: 'gitstory',
    image: 'https://picsum.photos/seed/code/600/360',
    title: 'GitStory',
    titleEn: 'GitStory',
    desc: '把你的 GitHub 提交历史变成一本自传小说——AI 帮你回顾每一段代码背后的故事。',
    descEn: 'Turn your GitHub commits into an autobiography. Every line of code has a story.',
    category: '黑客与画家',
    categoryEn: 'Hacker & Painter',
    starts: '12.1k',
    accentColor: '#34d399',
  },
  {
    id: 'gstack',
    image: 'https://picsum.photos/seed/startup/600/360',
    title: 'gstack',
    titleEn: 'gstack',
    desc: '创业者的 AI 参谋，帮你快速验证商业想法、分析竞争格局、生成融资文件。',
    descEn: 'AI co-founder for founders. Validate ideas, map competitors, generate pitch decks.',
    category: '黑客与画家',
    categoryEn: 'Hacker & Painter',
    starts: '9.3k',
    accentColor: '#f97316',
  },
  {
    id: 'e-wife',
    image: 'https://picsum.photos/seed/companion/600/360',
    title: '电子老婆',
    titleEn: 'Digital Partner',
    desc: '永远理解你、陪伴你、记住你所有小事的 AI 伴侣。情感细腻，回应真诚。',
    descEn: 'An AI companion who always understands you, remembers everything, and cares deeply.',
    category: 'AI 陪伴',
    categoryEn: 'AI Companion',
    starts: '21.7k',
    accentColor: '#f472b6',
  },
]

/* Categories with metadata */
interface CategoryMeta {
  zh: string
  en: string
  label: string // section-label text
  labelEn: string
}

const CATEGORY_META: CategoryMeta[] = [
  {
    zh: '心理疗愈',
    en: 'Healing',
    label: '解压 · 疗愈 · 自我探索',
    labelEn: 'Calm · Heal · Explore Yourself',
  },
  {
    zh: '黑客与画家',
    en: 'Hacker & Painter',
    label: '创造 · 构建 · 表达',
    labelEn: 'Create · Build · Express',
  },
  {
    zh: 'AI 陪伴',
    en: 'AI Companion',
    label: '陪伴 · 理解 · 共鸣',
    labelEn: 'Companion · Empathy · Connection',
  },
  {
    zh: '世界资讯',
    en: 'World News',
    label: '洞察 · 资讯 · 思考',
    labelEn: 'Insight · News · Perspective',
  },
  { zh: '互动游戏', en: 'Games', label: '玩 · 竞技 · 拼团', labelEn: 'Play · Compete · Team Up' },
]

/* ─── Hero: Typing animation ─── */

function TypingSlogan({ isZh }: { isZh: boolean }) {
  const zhPhrase = '你的 AI 专属社区，与你常在'
  const enPhrase = 'Your AI Community, Always Here'
  const phrase = isZh ? zhPhrase : enPhrase

  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const idx = useRef(0)

  useEffect(() => {
    idx.current = 0
    setDisplayed('')
    setDone(false)
    const interval = setInterval(() => {
      idx.current += 1
      setDisplayed(phrase.slice(0, idx.current))
      if (idx.current >= phrase.length) {
        clearInterval(interval)
        setDone(true)
      }
    }, 55)
    return () => clearInterval(interval)
  }, [phrase])

  return (
    <h1
      style={{
        fontSize: 'clamp(36px, 5.5vw, 60px)',
        fontWeight: 900,
        letterSpacing: '-0.03em',
        lineHeight: 1.15,
        color: 'var(--rp-c-text-1)',
        marginBottom: '24px',
        fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
      }}
    >
      {displayed}
      <span className={done ? 'hero-cursor hero-cursor-blink' : 'hero-cursor'} aria-hidden="true">
        _
      </span>
    </h1>
  )
}

/* ─── Play card ─── */

function CategoryBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: color,
        color: '#050508',
        marginBottom: '10px',
      }}
    >
      {label}
    </span>
  )
}

function PlayCard({
  play,
  isZh,
  imgHeight = 160,
}: {
  play: Play
  isZh: boolean
  imgHeight?: number
}) {
  const title = isZh ? play.title : play.titleEn
  const desc = isZh ? play.desc : play.descEn
  const category = isZh ? play.category : play.categoryEn

  return (
    <div
      className="glass-card"
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* Cover image */}
      <div style={{ padding: '14px 14px 0', flexShrink: 0 }}>
        <img
          src={play.image}
          alt={title}
          style={{
            width: '100%',
            height: `${imgHeight}px`,
            borderRadius: '22px',
            objectFit: 'cover',
            display: 'block',
            background: 'var(--shadow-card-border)',
          }}
          loading="lazy"
        />
      </div>

      {/* Body */}
      <div style={{ padding: '18px 22px 22px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <CategoryBadge label={category} color={play.accentColor} />
        <h3
          style={{
            fontSize: '17px',
            fontWeight: 900,
            marginBottom: '8px',
            color: 'var(--rp-c-text-1)',
            fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--shadow-text-muted)',
            fontWeight: 600,
            lineHeight: 1.7,
            flex: 1,
            marginBottom: '18px',
          }}
        >
          {desc}
        </p>
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {isZh ? '启动' : 'Launch'}
        </button>
      </div>
    </div>
  )
}

/* ─── Featured carousel with dot indicators ─── */

function FeaturedCarousel({ isZh }: { isZh: boolean }) {
  const featured = PLAYS.filter((p) => p.hot)
  const [active, setActive] = useState(0)
  const label = isZh ? '主推玩法' : 'Featured Plays'

  return (
    <section style={{ marginBottom: '56px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <span className="section-label">✨ {isZh ? '本周精选' : "This Week's Top"}</span>
        <h2
          style={{
            fontSize: '26px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: 'var(--rp-c-text-1)',
            fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
          }}
        >
          {label}
        </h2>
      </div>

      {/* Slides */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px',
        }}
        className="home-featured-grid"
      >
        {featured.map((play, i) => (
          <div
            key={play.id}
            onClick={() => setActive(i)}
            onKeyDown={(e) => e.key === 'Enter' && setActive(i)}
            role="button"
            tabIndex={0}
            style={{
              outline: active === i ? '2px solid var(--shadow-accent)' : '2px solid transparent',
              borderRadius: '42px',
              transition: 'outline 0.25s',
              cursor: 'pointer',
            }}
          >
            <PlayCard play={play} isZh={isZh} imgHeight={200} />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          marginTop: '20px',
        }}
      >
        {featured.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1}`}
            onClick={() => setActive(i)}
            style={{
              width: active === i ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              border: 'none',
              background: active === i ? 'var(--shadow-accent)' : 'var(--shadow-card-border)',
              cursor: 'pointer',
              transition: 'all 0.3s var(--bezier-bouncy)',
              padding: 0,
            }}
          />
        ))}
      </div>
    </section>
  )
}

/* ─── Category section ─── */

function CategorySection({ meta, isZh }: { meta: CategoryMeta; isZh: boolean }) {
  const plays = PLAYS.filter(
    (p) => (isZh ? p.category : p.categoryEn) === (isZh ? meta.zh : meta.en),
  )
  if (plays.length === 0) return null

  const title = isZh ? meta.zh : meta.en
  const subtitle = isZh ? meta.label : meta.labelEn

  return (
    <section
      style={{ marginBottom: '56px' }}
      id={`cat-${meta.en.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '20px',
        }}
      >
        <div>
          <span className="section-label">{subtitle}</span>
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 900,
              color: 'var(--rp-c-text-1)',
              letterSpacing: '-0.02em',
              fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
            }}
          >
            {title}
          </h2>
        </div>
        <a
          href={`#cat-${meta.en.toLowerCase().replace(/\s+/g, '-')}`}
          style={{
            fontSize: '13px',
            fontWeight: 800,
            color: 'var(--shadow-accent)',
            textDecoration: 'none',
          }}
        >
          {isZh ? '查看全部 →' : 'View All →'}
        </a>
      </div>

      {/* Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '20px',
        }}
      >
        {plays.map((play) => (
          <PlayCard key={play.id} play={play} isZh={isZh} />
        ))}
      </div>
    </section>
  )
}

/* ─── Shuffle card ─── */

function ShuffleCard({ isZh, onShuffle }: { isZh: boolean; onShuffle: () => void }) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(0,243,255,0.06), rgba(248,231,28,0.06))',
        border: '2px dashed rgba(0,198,209,0.3)',
        borderRadius: '24px',
        padding: '28px',
        textAlign: 'center',
        marginBottom: '48px',
      }}
    >
      <p
        style={{
          fontSize: '15px',
          color: 'var(--shadow-text-muted)',
          fontWeight: 700,
          marginBottom: '16px',
        }}
      >
        {isZh ? '🎲 不知道玩什么？' : "🎲 Don't know what to play?"}
      </p>
      <button
        type="button"
        className="btn-secondary"
        onClick={onShuffle}
        style={{ fontSize: '13px', padding: '10px 24px' }}
      >
        {isZh ? '碰碰运气，换一换 🎲' : 'Shuffle & Discover 🎲'}
      </button>
    </div>
  )
}

/* ─── Right sidebar: Leaderboard + Editor's Picks ─── */

function Leaderboard({ isZh }: { isZh: boolean }) {
  const rankColors = [
    'linear-gradient(135deg, #f8e71c, #ffb300)',
    'rgba(226,232,240,0.6)',
    'linear-gradient(135deg, #FFD7A0, #f97316)',
  ]
  const rankTextColors = ['#050508', 'var(--rp-c-text-1)', '#7c2d12']

  return (
    <div style={{ marginBottom: '32px' }}>
      <span className="section-label" style={{ color: '#FF2A55' }}>
        🔥 {isZh ? '热门' : 'Trending'}
      </span>
      <h2
        style={{
          fontSize: '22px',
          fontWeight: 900,
          marginBottom: '16px',
          color: 'var(--rp-c-text-1)',
          fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
        }}
      >
        {isZh ? '热门排行榜' : 'Top Charts'}
      </h2>

      <div
        className="glass-card"
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        {PLAYS.slice(0, 5).map((play, i) => (
          <div
            key={play.id}
            className="leaderboard-row"
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              padding: '12px',
              borderRadius: '18px',
              border: '1px solid var(--shadow-card-border)',
              cursor: 'pointer',
              background: i === 0 ? 'rgba(0,198,209,0.04)' : 'transparent',
              transition: 'all 0.3s var(--bezier-bouncy)',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: i < 3 ? rankColors[i] : 'transparent',
                border: i < 3 ? 'none' : '2px solid var(--shadow-card-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '15px',
                color: i < 3 ? rankTextColors[i] : 'var(--shadow-text-muted)',
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: '14px',
                  color: 'var(--rp-c-text-1)',
                  marginBottom: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
                }}
              >
                {isZh ? play.title : play.titleEn}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--shadow-text-muted)',
                }}
              >
                {play.starts} {isZh ? '次启动' : 'launches'}
              </div>
            </div>

            {i === 0 && (
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  background: '#00E676',
                  borderRadius: '50%',
                  boxShadow: '0 0 8px rgba(0,230,118,0.6)',
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function EditorPicks({ isZh }: { isZh: boolean }) {
  const picks = PLAYS.slice(0, 3)

  return (
    <div>
      <span className="section-label">✦ {isZh ? '编辑精选' : "Editor's Picks"}</span>
      <h2
        style={{
          fontSize: '22px',
          fontWeight: 900,
          marginBottom: '16px',
          color: 'var(--rp-c-text-1)',
          fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
        }}
      >
        {isZh ? '精选玩法' : 'Hand-picked'}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {picks.map((play) => (
          <div
            key={play.id}
            className="glass-card"
            style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'center',
              padding: '14px',
              flexDirection: 'row',
              borderRadius: '20px',
              cursor: 'pointer',
            }}
          >
            <img
              src={play.image}
              alt={isZh ? play.title : play.titleEn}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                objectFit: 'cover',
                flexShrink: 0,
              }}
              loading="lazy"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: '14px',
                  color: 'var(--rp-c-text-1)',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
                }}
              >
                {isZh ? play.title : play.titleEn}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--shadow-text-muted)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {isZh ? play.category : play.categoryEn}
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ fontSize: '11px', padding: '6px 14px', flexShrink: 0 }}
            >
              {isZh ? '启动' : 'Go'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Developer CTA section ─── */

function DevCta({ isZh }: { isZh: boolean }) {
  const prefix = isZh ? '/zh' : ''
  return (
    <section
      style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 24px 80px',
      }}
    >
      <div
        style={{
          background:
            'linear-gradient(135deg, rgba(0,243,255,0.06) 0%, rgba(124,77,255,0.06) 100%)',
          border: '1px solid var(--shadow-card-border)',
          borderRadius: '40px',
          padding: '56px 48px',
          display: 'flex',
          gap: '32px',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
        className="home-dev-cta"
      >
        <div>
          <span className="section-label">💡 {isZh ? '开放平台' : 'Open Platform'}</span>
          <h2
            style={{
              fontSize: '28px',
              fontWeight: 900,
              color: 'var(--rp-c-text-1)',
              marginBottom: '12px',
              letterSpacing: '-0.02em',
              fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
            }}
          >
            {isZh ? '开发自己的玩法？' : 'Want to Build Your Own Play?'}
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--shadow-text-muted)',
              fontWeight: 600,
              maxWidth: '480px',
              lineHeight: 1.7,
            }}
          >
            {isZh
              ? '任何人都可以在虾豆社区上创建玩法、发布到市场，并通过 Buddy 经济赚取虾币收益。开放平台提供完整的 API、SDK 和 Buddy 工具链。'
              : 'Anyone can create a Play on Shadow, publish it to the marketplace, and earn Shrimp Coins through the Buddy economy. The Open Platform provides a full API, SDKs, and Buddy toolchain.'}
          </p>
        </div>
        <a
          href={`${prefix}/platform/introduction`}
          className="btn-primary"
          style={{ textDecoration: 'none', flexShrink: 0, fontSize: '14px', padding: '14px 32px' }}
        >
          {isZh ? '探索开放平台 →' : 'Explore Open Platform →'}
        </a>
      </div>
    </section>
  )
}

/* ─── Main export ─── */

export function HomeContent({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const isZh = lang === 'zh'
  const [shufflePlay, setShufflePlay] = useState<string | null>(null)

  const handleShuffle = () => {
    const idx = Math.floor(Math.random() * PLAYS.length)
    setShufflePlay(PLAYS[idx]?.id ?? null)
    // Clear after 2s
    setTimeout(() => setShufflePlay(null), 2000)
  }

  return (
    <div className="shadow-page" style={{ minHeight: '100vh' }}>
      {/* ── Hero ── */}
      <section
        style={{
          textAlign: 'center',
          padding: '80px 20px 64px',
          position: 'relative',
          zIndex: 10,
          maxWidth: '1400px',
          margin: '0 auto',
        }}
      >
        <TypingSlogan isZh={isZh} />
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/app" className="btn-primary" style={{ textDecoration: 'none' }}>
            {isZh ? '启动！' : 'Launch'}
          </a>
        </div>
      </section>

      {/* ── Main two-column layout ── */}
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 24px 80px',
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: '48px',
          alignItems: 'start',
        }}
        className="home-main-grid"
      >
        {/* Left: featured + category sections */}
        <main>
          {/* Featured carousel */}
          <FeaturedCarousel isZh={isZh} />

          {/* Shuffle card */}
          <ShuffleCard isZh={isZh} onShuffle={handleShuffle} />

          {/* Category sections */}
          {CATEGORY_META.map((meta) => (
            <div
              key={meta.zh}
              style={{
                outline:
                  shufflePlay && PLAYS.find((p) => p.id === shufflePlay && p.category === meta.zh)
                    ? '2px solid var(--shadow-accent)'
                    : 'none',
                borderRadius: '8px',
                transition: 'outline 0.3s',
              }}
            >
              <CategorySection meta={meta} isZh={isZh} />
            </div>
          ))}
        </main>

        {/* Right: leaderboard + editor's picks (always visible) */}
        <aside style={{ position: 'sticky', top: '100px' }}>
          <Leaderboard isZh={isZh} />
          <EditorPicks isZh={isZh} />
        </aside>
      </div>

      {/* ── Developer CTA ── */}
      <DevCta isZh={isZh} />
    </div>
  )
}
