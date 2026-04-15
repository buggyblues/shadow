import { useEffect, useRef, useState } from 'react'

/* ─── Data ─── */

interface Play {
  id: string
  image: string
  title: string
  titleEn: string
  desc: string
  descEn: string
  category: string
  categoryEn: string
  starts: string
  accentColor: string
  hot?: boolean
}

const PLAYS: Play[] = [
  /* 心理疗愈 */
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
    descEn: 'Input your assets and expenses — get your financial freedom score and roadmap.',
    category: '心理疗愈',
    categoryEn: 'Healing',
    starts: '18.2k',
    accentColor: '#f8e71c',
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
  /* 世界资讯 */
  {
    id: 'world-pulse',
    image: 'https://picsum.photos/seed/globe/600/360',
    title: '地球脉搏',
    titleEn: 'World Pulse',
    desc: '实时抓取全球重大事件，用三句话告诉你今天真正发生了什么，无废话。',
    descEn: 'Real-time global events in 3 sentences. No filler, just signal.',
    category: '世界资讯',
    categoryEn: 'World News',
    starts: '14.1k',
    accentColor: '#38bdf8',
  },
  {
    id: 'daily-brief',
    image: 'https://picsum.photos/seed/newspaper/600/360',
    title: '晨间简报',
    titleEn: 'Morning Brief',
    desc: '每天 7:00 推送一份定制早报：国际、科技、市场三大板块，读完只需 3 分钟。',
    descEn: 'Custom morning digest at 7am — global news, tech, markets. 3-minute read.',
    category: '世界资讯',
    categoryEn: 'World News',
    starts: '11.3k',
    accentColor: '#fb923c',
  },
  /* 互动游戏 */
  {
    id: 'ai-werewolf',
    image: 'https://picsum.photos/seed/wolf/600/360',
    title: 'AI 狼人杀',
    titleEn: 'AI Werewolf',
    desc: 'AI 担任主持，随机分配身份，在聊天中展开推理与博弈，3 人即可开局。',
    descEn: 'AI-hosted werewolf — roles assigned randomly, deduce, bluff, and vote. 3+ players.',
    category: '互动游戏',
    categoryEn: 'Games',
    starts: '20.8k',
    accentColor: '#f87171',
    hot: true,
  },
  {
    id: 'code-arena',
    image: 'https://picsum.photos/seed/arena/600/360',
    title: '代码擂台',
    titleEn: 'Code Arena',
    desc: '实时编程对战，AI 出题、计时、自动评测，挑战好友或匹配陌生对手。',
    descEn: 'Real-time coding battles — AI generates problems, auto-judges, ranks you live.',
    category: '互动游戏',
    categoryEn: 'Games',
    starts: '8.6k',
    accentColor: '#fbbf24',
  },
  /* 黑客与画家 */
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
    hot: true,
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
  /* AI 陪伴 */
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

/* ─── Category metadata (order: 心理疗愈 > 世界资讯 > 互动游戏 > 黑客与画家 > AI 陪伴) ─── */

interface CategoryMeta {
  zh: string
  en: string
  label: string
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
    zh: '世界资讯',
    en: 'World News',
    label: '洞察 · 资讯 · 思考',
    labelEn: 'Insight · News · Perspective',
  },
  { zh: '互动游戏', en: 'Games', label: '玩 · 竞技 · 拼团', labelEn: 'Play · Compete · Team Up' },
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
]

/* ─── Topic collections (专题) ─── */

interface Topic {
  id: string
  cover: string
  titleZh: string
  titleEn: string
  descZh: string
  descEn: string
  count: number
  accent: string
}

const TOPICS: Topic[] = [
  {
    id: 'workplace-relief',
    cover: 'https://picsum.photos/seed/workplace/600/340',
    titleZh: '职场减压合集',
    titleEn: 'Workplace Relief',
    descZh: '打工人下班必备的解压神器合集',
    descEn: 'Wind-down essentials for after work',
    count: 12,
    accent: '#a78bfa',
  },
  {
    id: 'hacker-pack',
    cover: 'https://picsum.photos/seed/hacker/600/340',
    titleZh: '程序员必玩',
    titleEn: 'Hacker Pack',
    descZh: '写代码的你，值得更好玩的工具',
    descEn: 'The best plays built for developers',
    count: 8,
    accent: '#34d399',
  },
  {
    id: 'night-radio',
    cover: 'https://picsum.photos/seed/nightsky/600/340',
    titleZh: '深夜电台',
    titleEn: 'Night Radio',
    descZh: '凌晨两点，聊聊那些不敢说的话',
    descEn: "Late-night conversations you can't have elsewhere",
    count: 6,
    accent: '#f472b6',
  },
]

/* ─── Hero: Typing slogan (2 lines, loops) ─── */

function TypingSlogan({ isZh }: { isZh: boolean }) {
  const zhLines: [string, string] = ['你的 AI 专属社区，', '与你常在']
  const enLines: [string, string] = ['Your AI Community,', 'Always Here']
  const lines = isZh ? zhLines : enLines
  const line1Len = lines[0].length
  const totalLen = line1Len + lines[1].length

  const [charIdx, setCharIdx] = useState(0)
  const [looping, setLooping] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false
    setCharIdx(0)
    setLooping(false)

    let idx = 0
    const type = () => {
      if (cancelRef.current) return
      idx++
      setCharIdx(idx)
      if (idx < totalLen) {
        setTimeout(type, 55)
      } else {
        setLooping(true)
        setTimeout(() => {
          if (cancelRef.current) return
          setLooping(false)
          idx = 0
          setCharIdx(0)
          setTimeout(type, 300)
        }, 2200)
      }
    }
    setTimeout(type, 300)
    return () => {
      cancelRef.current = true
    }
  }, [isZh, totalLen])

  const line1 = lines[0].slice(0, Math.min(charIdx, line1Len))
  const line2 = charIdx > line1Len ? lines[1].slice(0, charIdx - line1Len) : ''
  const showCursorOnLine1 = charIdx <= line1Len && !looping
  const showCursorOnLine2 = charIdx > line1Len || looping
  const cursorClass = looping ? 'hero-cursor hero-cursor-blink' : 'hero-cursor'

  return (
    <h1
      style={{
        fontSize: 'clamp(32px, 5vw, 58px)',
        fontWeight: 900,
        letterSpacing: '-0.03em',
        lineHeight: 1.2,
        color: 'var(--rp-c-text-1)',
        marginBottom: '24px',
        fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
      }}
    >
      <span>
        {line1}
        {showCursorOnLine1 && (
          <span className="hero-cursor" aria-hidden="true">
            _
          </span>
        )}
      </span>
      <br />
      <span>
        {line2}
        {showCursorOnLine2 && (
          <span className={cursorClass} aria-hidden="true">
            _
          </span>
        )}
      </span>
    </h1>
  )
}

/* ─── CSS 3D Dice ─── */

// Pip grid positions [row, col] for faces 1-6
const PIPS: Array<Array<[number, number]>> = [
  [[1, 1]],
  [
    [0, 2],
    [2, 0],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
  [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
]

// Face transforms for a 120px cube (half = 60px)
const FACE_TRANSFORMS = [
  'rotateY(0deg) translateZ(60px)', // front  = 1
  'rotateY(90deg) translateZ(60px)', // right  = 2
  'rotateX(90deg) translateZ(60px)', // top    = 3
  'rotateX(-90deg) translateZ(60px)', // bottom = 4
  'rotateY(-90deg) translateZ(60px)', // left   = 5
  'rotateY(180deg) translateZ(60px)', // back   = 6
]

function DiceFace({ faceIdx }: { faceIdx: number }) {
  const pips = PIPS[faceIdx]
  const SIZE = 120
  const PAD = 15
  const CELL = 30
  const PIP = 14

  return (
    <div
      style={{
        position: 'absolute',
        width: `${SIZE}px`,
        height: `${SIZE}px`,
        transform: FACE_TRANSFORMS[faceIdx],
        background: 'rgba(8, 10, 22, 0.88)',
        backdropFilter: 'blur(12px)',
        border: '1.5px solid rgba(0, 243, 255, 0.32)',
        borderRadius: '20px',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {pips.map(([row, col], i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: `${PIP}px`,
              height: `${PIP}px`,
              borderRadius: '50%',
              background: 'var(--shadow-accent)',
              boxShadow: '0 0 8px rgba(0,243,255,0.9)',
              left: `${PAD + col * CELL + (CELL - PIP) / 2}px`,
              top: `${PAD + row * CELL + (CELL - PIP) / 2}px`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

function DiceSection({ isZh }: { isZh: boolean }) {
  const [rolling, setRolling] = useState(false)
  const [resultPlay, setResultPlay] = useState<Play | null>(null)
  const rotRef = useRef({ x: -15, y: 25 })
  const [diceRot, setDiceRot] = useState({ x: -15, y: 25 })

  const rollDice = () => {
    if (rolling) return
    setRolling(true)
    setResultPlay(null)

    const spinsX = 1440 + Math.random() * 720
    const spinsY = 1080 + Math.random() * 720
    rotRef.current = { x: rotRef.current.x + spinsX, y: rotRef.current.y + spinsY }
    setDiceRot({ ...rotRef.current })

    setTimeout(() => {
      const randomPlay = PLAYS[Math.floor(Math.random() * PLAYS.length)]
      setResultPlay(randomPlay)
      setRolling(false)
    }, 2000)
  }

  return (
    <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px 80px' }}>
      <div
        style={{
          background:
            'linear-gradient(135deg, rgba(0,243,255,0.04) 0%, rgba(248,231,28,0.04) 100%)',
          border: '1px dashed rgba(0,198,209,0.3)',
          borderRadius: '40px',
          padding: '56px 48px',
          textAlign: 'center',
        }}
      >
        <span className="section-label">🎲 {isZh ? '随机探索' : 'Random Discovery'}</span>
        <h2
          style={{
            fontSize: '26px',
            fontWeight: 900,
            color: 'var(--rp-c-text-1)',
            marginBottom: '8px',
            marginTop: '4px',
            fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
          }}
        >
          {isZh ? '不知道玩什么？' : "Don't know what to play?"}
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--shadow-text-muted)',
            fontWeight: 600,
            marginBottom: '40px',
          }}
        >
          {isZh ? '点击骰子，落地之后随机一个玩法' : 'Click the dice and land on a random play'}
        </p>

        {/* 3D Dice */}
        <div
          style={{
            perspective: '800px',
            width: '120px',
            height: '120px',
            margin: '0 auto 40px',
            cursor: rolling ? 'not-allowed' : 'pointer',
          }}
          onClick={rollDice}
          onKeyDown={(e) => e.key === 'Enter' && rollDice()}
          role="button"
          tabIndex={0}
          aria-label={isZh ? '投骰子' : 'Roll dice'}
        >
          <div
            style={{
              width: '120px',
              height: '120px',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transform: `rotateX(${diceRot.x}deg) rotateY(${diceRot.y}deg)`,
              transition: rolling
                ? 'transform 2s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <DiceFace key={n} faceIdx={n} />
            ))}
          </div>
        </div>

        {rolling && (
          <p
            style={{
              fontSize: '14px',
              color: 'var(--shadow-accent)',
              fontWeight: 700,
              marginBottom: '24px',
            }}
          >
            {isZh ? '骰子滚动中…' : 'Rolling…'}
          </p>
        )}

        {resultPlay && !rolling && (
          <div style={{ maxWidth: '320px', margin: '0 auto' }}>
            <PlayCard play={resultPlay} isZh={isZh} />
            <button
              type="button"
              className="btn-secondary"
              onClick={rollDice}
              style={{
                marginTop: '16px',
                width: '100%',
                justifyContent: 'center',
                fontSize: '13px',
              }}
            >
              {isZh ? '再来一次 🎲' : 'Roll Again 🎲'}
            </button>
          </div>
        )}

        {!resultPlay && !rolling && (
          <button
            type="button"
            className="btn-secondary"
            onClick={rollDice}
            style={{ fontSize: '13px', padding: '12px 32px' }}
          >
            {isZh ? '投骰子！' : 'Roll the Dice!'}
          </button>
        )}
      </div>
    </section>
  )
}

/* ─── Category badge + play card ─── */

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

/* ─── Featured carousel (3 hot plays, 3 columns) ─── */

function FeaturedCarousel({ isZh }: { isZh: boolean }) {
  const featured = PLAYS.filter((p) => p.hot)
  const [active, setActive] = useState(0)
  const pauseRef = useRef(false)

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (featured.length <= 1) return
    const t = setInterval(() => {
      if (!pauseRef.current) setActive((a) => (a + 1) % featured.length)
    }, 5000)
    return () => clearInterval(t)
  }, [featured.length])

  const prev = () => setActive((a) => (a - 1 + featured.length) % featured.length)
  const next = () => setActive((a) => (a + 1) % featured.length)

  const play = featured[active]
  if (!play) return null

  const title = isZh ? play.title : play.titleEn
  const desc = isZh ? play.desc : play.descEn
  const category = isZh ? play.category : play.categoryEn

  const arrowBtn: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(5, 5, 8, 0.55)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '50%',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#fff',
    fontSize: '20px',
    zIndex: 10,
    flexShrink: 0,
  }

  return (
    <section style={{ marginBottom: '56px' }}>
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
          {isZh ? '主推玩法' : 'Featured Plays'}
        </h2>
      </div>

      {/* Large card wrapper */}
      <div
        className="glass-card"
        style={{ position: 'relative', overflow: 'hidden', padding: 0 }}
        onMouseEnter={() => {
          pauseRef.current = true
        }}
        onMouseLeave={() => {
          pauseRef.current = false
        }}
      >
        {/* Animated large card */}
        <div
          key={active}
          className="home-featured-large-card"
          style={{ animation: 'featuredSlideIn 0.38s ease both' }}
        >
          {/* Left: image */}
          <div className="home-featured-large-img">
            <img src={play.image} alt={title} loading="lazy" />
          </div>

          {/* Right: content */}
          <div className="home-featured-large-body">
            <CategoryBadge label={category} color={play.accentColor} />
            <h3
              style={{
                fontSize: 'clamp(22px, 2.5vw, 32px)',
                fontWeight: 900,
                color: 'var(--rp-c-text-1)',
                marginBottom: '12px',
                lineHeight: 1.2,
                fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--shadow-text-muted)',
                fontWeight: 600,
                lineHeight: 1.75,
                marginBottom: '28px',
                flex: 1,
              }}
            >
              {desc}
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '15px', padding: '12px 32px' }}
              >
                {isZh ? '启动' : 'Launch'}
              </button>
              <span
                style={{ fontSize: '12px', color: 'var(--shadow-text-muted)', fontWeight: 700 }}
              >
                {play.starts} {isZh ? '次启动' : 'launches'}
              </span>
            </div>
          </div>
        </div>

        {/* Prev arrow */}
        <button
          type="button"
          aria-label="Previous"
          onClick={prev}
          style={{ ...arrowBtn, left: '16px' }}
        >
          ‹
        </button>

        {/* Next arrow */}
        <button
          type="button"
          aria-label="Next"
          onClick={next}
          style={{ ...arrowBtn, right: '16px' }}
        >
          ›
        </button>
      </div>

      {/* Dot indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
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

/* ─── Topic card + Featured Topics section (专题) ─── */

function TopicCard({ topic, isZh }: { topic: Topic; isZh: boolean }) {
  const title = isZh ? topic.titleZh : topic.titleEn
  const desc = isZh ? topic.descZh : topic.descEn

  return (
    <a href="#" style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          position: 'relative',
          border: '1px solid var(--shadow-card-border)',
          borderRadius: '28px',
          overflow: 'hidden',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px rgba(0,0,0,0.3)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
        }}
      >
        <img
          src={topic.cover}
          alt={title}
          style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
          loading="lazy"
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background:
              'linear-gradient(to top, rgba(5,5,8,0.92) 0%, rgba(5,5,8,0.3) 60%, transparent 100%)',
            padding: '36px 20px 20px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: topic.accent,
              marginBottom: '6px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {topic.count} {isZh ? '个玩法' : 'plays'}
          </div>
          <div
            style={{
              fontWeight: 900,
              fontSize: '18px',
              color: '#fff',
              marginBottom: '4px',
              fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
            {desc}
          </div>
        </div>
      </div>
    </a>
  )
}

function FeaturedTopics({ isZh }: { isZh: boolean }) {
  return (
    <section style={{ marginBottom: '56px' }}>
      <div style={{ marginBottom: '20px' }}>
        <span className="section-label">
          ✦ {isZh ? '精心策划的主题合集' : 'Curated Theme Collections'}
        </span>
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: 'var(--rp-c-text-1)',
            fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
          }}
        >
          {isZh ? '专题' : 'Topics'}
        </h2>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}
        className="home-topics-grid"
      >
        {TOPICS.map((topic) => (
          <TopicCard key={topic.id} topic={topic} isZh={isZh} />
        ))}
      </div>
    </section>
  )
}

/* ─── Category section ─── */

function CategorySection({ meta, isZh }: { meta: CategoryMeta; isZh: boolean }) {
  const plays = PLAYS.filter((p) => (isZh ? p.category === meta.zh : p.categoryEn === meta.en))
  if (plays.length === 0) return null

  const title = isZh ? meta.zh : meta.en
  const subtitle = isZh ? meta.label : meta.labelEn
  const slug = meta.en.toLowerCase().replace(/\s+/g, '-')

  return (
    <section style={{ marginBottom: '56px' }} id={`cat-${slug}`}>
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
          href={`#cat-${slug}`}
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
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--shadow-text-muted)' }}>
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

/* ─── Developer CTA ─── */

function DevCta({ isZh }: { isZh: boolean }) {
  const prefix = isZh ? '/zh' : ''
  return (
    <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px 80px' }}>
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
        {/* Tagline above slogan */}
        <p
          style={{
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--shadow-accent)',
            marginBottom: '18px',
            opacity: 0.85,
            fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
          }}
        >
          {isZh ? '一切玩法，任你创想' : 'Every Play, Yours to Imagine'}
        </p>

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
        {/* Left: featured + topics + category sections */}
        <main>
          <FeaturedCarousel isZh={isZh} />
          <FeaturedTopics isZh={isZh} />
          {CATEGORY_META.map((meta) => (
            <CategorySection key={meta.zh} meta={meta} isZh={isZh} />
          ))}
        </main>

        {/* Right: leaderboard + editor's picks */}
        <aside style={{ position: 'sticky', top: '100px' }}>
          <Leaderboard isZh={isZh} />
          <EditorPicks isZh={isZh} />
        </aside>
      </div>

      {/* ── Dice Section (second to last) ── */}
      <DiceSection isZh={isZh} />

      {/* ── Developer CTA (last) ── */}
      <DevCta isZh={isZh} />
    </div>
  )
}
