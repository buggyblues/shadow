import confetti from 'canvas-confetti'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  Dice5,
  Flame,
  Lightbulb,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Trophy,
  WandSparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from 'rspress/runtime'
import { fetchConfig, fetchPlayCatalog } from '../lib/config-client'

/* ─── Scroll reveal ─── */
function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -28px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={{
        height: '100%',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(22px) scale(0.97)',
        transition: `opacity 0.52s ease ${delay}ms, transform 0.56s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

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
  status?: 'available' | 'gated' | 'coming_soon' | 'misconfigured'
  gates?: {
    auth?: 'none' | 'required'
    membership?: 'none' | 'required'
    profile?: 'none' | 'optional' | 'required'
  }
  action?: {
    kind: string
    templateSlug?: string
  }
}

declare const __SHADOW_APP_BASE_URL__: string | undefined

const DOCS_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
  '/'
).replace(/\/$/, '')
const HOME_ASSETS_BASE = `${DOCS_BASE}/home-assets`
const playCover = (id: string) => `${HOME_ASSETS_BASE}/plays/${id}.jpg`
const topicCover = (id: string) => `${HOME_ASSETS_BASE}/topics/${id}.jpg`
const configuredAppBase = () =>
  (typeof __SHADOW_APP_BASE_URL__ !== 'undefined' ? __SHADOW_APP_BASE_URL__ : '').replace(/\/$/, '')
const playLaunchUrl = (play: Play) =>
  `${configuredAppBase()}/app/play/launch?play=${encodeURIComponent(play.id)}`
const docsUrl = (path: string, isZh: boolean) => {
  const prefix = isZh ? '/zh' : ''
  return `${DOCS_BASE}${prefix}${path}`.replace(/\/{2,}/g, '/')
}
const canLaunchPlay = (play: Play) => play.status === 'available' || play.status === 'gated'
const playCtaLabel = (play: Play, t: (key: string) => string, short = false) => {
  if (!play.status) return t('home.playCta.loading')
  if (play.status === 'coming_soon') return t('home.playCta.comingSoon')
  if (play.status === 'misconfigured') return t('home.playCta.configuring')
  if (play.status === 'gated') return t('home.playCta.unlock')
  return t(short ? 'home.playCta.launchShort' : 'home.playCta.launch')
}
const WEBSITE_LOGIN_EVENT = 'shadow:website-login'

function hasStoredAuthSession() {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.localStorage.getItem('accessToken') && window.localStorage.getItem('refreshToken'),
  )
}

function appRedirectFromHref(href: string) {
  const url = new URL(href, window.location.href)
  return `${url.pathname}${url.search}${url.hash}`
}

function requestWebsiteLogin(redirect: string) {
  window.dispatchEvent(
    new CustomEvent(WEBSITE_LOGIN_EVENT, {
      detail: { redirect },
    }),
  )
}

const handlePlayLaunchClick = (play: Play, event: React.MouseEvent<HTMLAnchorElement>) => {
  if (event.defaultPrevented) return
  event.preventDefault()
  const redirect = appRedirectFromHref(event.currentTarget.href)
  if (!hasStoredAuthSession()) {
    requestWebsiteLogin(redirect)
    return
  }
  window.location.assign(event.currentTarget.href)
}

const handleAppEntryClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
  if (event.defaultPrevented) return
  event.preventDefault()
  const redirect = appRedirectFromHref(event.currentTarget.href)
  if (!hasStoredAuthSession()) {
    requestWebsiteLogin(redirect)
    return
  }
  window.location.assign(event.currentTarget.href)
}

function PlayLaunchCta({
  play,
  short = false,
  style,
}: {
  play: Play
  isZh?: boolean
  short?: boolean
  style?: React.CSSProperties
}) {
  const t = useI18n()
  const launchable = canLaunchPlay(play)
  const ctaStyle: React.CSSProperties = {
    ...style,
    gap: '8px',
    opacity: launchable ? 1 : 0.62,
    cursor: launchable ? 'pointer' : 'not-allowed',
  }
  const content = (
    <>
      <Play size={short ? 14 : 15} fill="currentColor" strokeWidth={short ? 2.7 : 2.6} />
      {playCtaLabel(play, t, short)}
    </>
  )

  if (!launchable) {
    return (
      <button type="button" className="btn-primary" disabled aria-disabled="true" style={ctaStyle}>
        {content}
      </button>
    )
  }

  return (
    <a
      href={playLaunchUrl(play)}
      onClick={(event) => handlePlayLaunchClick(play, event)}
      className="btn-primary"
      style={{ ...ctaStyle, textDecoration: 'none' }}
    >
      {content}
    </a>
  )
}

const PLAYS: Play[] = [
  /* 心理疗愈 */
  {
    id: 'retire-buddy',
    image: playCover('retire-buddy'),
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
    image: playCover('financial-freedom'),
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
    image: playCover('brain-fix'),
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
    image: playCover('world-pulse'),
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
    image: playCover('daily-brief'),
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
    image: playCover('ai-werewolf'),
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
    image: playCover('code-arena'),
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
    image: playCover('gitstory'),
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
    image: playCover('gstack'),
    title: 'gstack',
    titleEn: 'gstack',
    desc: '创业者的 AI 参谋，帮你快速验证商业想法、分析竞争格局、生成融资文件。',
    descEn: 'AI co-founder for founders. Validate ideas, map competitors, generate pitch decks.',
    category: '黑客与画家',
    categoryEn: 'Hacker & Painter',
    starts: '9.3k',
    accentColor: '#f97316',
  },
  /* Shadow Cloud / Buddy teams */
  {
    id: 'agent-marketplace-buddy',
    image: playCover('agent-marketplace-buddy'),
    title: 'Agent Marketplace Buddy',
    titleEn: 'Agent Marketplace Buddy',
    desc: '可组合专家 agent 市场，覆盖开发、安全、基础设施、数据、文档、SEO 和 workflow 编排。',
    descEn:
      'A composable specialist-agent marketplace for development, security, infra, data, docs, SEO, and workflow orchestration.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '16.4k',
    accentColor: '#22d3ee',
    hot: true,
  },
  {
    id: 'bmad-method-buddy',
    image: playCover('bmad-method-buddy'),
    title: 'BMAD 方法 Buddy',
    titleEn: 'BMAD Method Buddy',
    desc: '基于 BMAD Method 覆盖分析、PRD、UX、架构、故事拆解、实现、QA 和复盘。',
    descEn:
      'Agile AI development across analysis, PRD, UX, architecture, story shaping, implementation, QA, and retros.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '10.8k',
    accentColor: '#a78bfa',
  },
  {
    id: 'claude-ads-buddy',
    image: playCover('claude-ads-buddy'),
    title: 'Claude Ads Buddy',
    titleEn: 'Claude Ads Buddy',
    desc: '付费广告审计与优化团队，支持平台检查、预算建模、创意评审、追踪问题和落地页瓶颈分析。',
    descEn:
      'Paid advertising audits for platform checks, budget models, creative review, tracking issues, and landing-page bottlenecks.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '7.9k',
    accentColor: '#fb7185',
  },
  {
    id: 'claude-seo-buddy',
    image: playCover('claude-seo-buddy'),
    title: 'Claude SEO Buddy',
    titleEn: 'Claude SEO Buddy',
    desc: '技术 SEO 与 GEO/AEO 审计团队，覆盖内容、技术、增长检查和扩展指引。',
    descEn:
      'Technical SEO and GEO/AEO audits across content, technical checks, growth review, and expansion guidance.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '8.7k',
    accentColor: '#34d399',
  },
  {
    id: 'everything-claude-code-buddy',
    image: playCover('everything-claude-code-buddy'),
    title: 'Everything Claude Code Buddy',
    titleEn: 'Everything Claude Code Buddy',
    desc: '全栈工程协作工作台，帮助研发团队沉淀自动化流程、质量检查和交付规范。',
    descEn:
      'A broad engineering workspace for automation flows, quality checks, and delivery discipline.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '13.2k',
    accentColor: '#60a5fa',
  },
  {
    id: 'google-workspace-buddy',
    image: playCover('google-workspace-buddy'),
    title: 'Google Workspace Buddy',
    titleEn: 'Google Workspace Buddy',
    desc: '日常办公自动化团队，支持 Gmail 分诊、日程准备、Drive 检索、Docs 起草和 Sheets 更新。',
    descEn:
      'Workspace operations for Gmail triage, calendar planning, Drive search, Docs drafting, and Sheets updates.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '12.5k',
    accentColor: '#fbbf24',
  },
  {
    id: 'gsd-buddy',
    image: playCover('gsd-buddy'),
    title: 'GSD 规格驱动 Buddy',
    titleEn: 'GSD Spec Buddy',
    desc: '规格驱动开发团队，串联项目上下文、里程碑、规划、执行、验证和交付流程。',
    descEn:
      'Spec-driven development across project context, milestones, planning, execution, verification, and delivery loops.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '9.8k',
    accentColor: '#f97316',
  },
  {
    id: 'gstack-buddy',
    image: playCover('gstack-buddy'),
    title: 'gstack 战略 Buddy',
    titleEn: 'gstack Strategy Buddy',
    desc: '虚拟产品团队，支持产品压力测试、CEO 视角范围评审、系统化调查、周复盘和辅助工具。',
    descEn:
      'A virtual product team for pressure tests, CEO-style scope review, investigation discipline, retros, and helper scripts.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '11.6k',
    accentColor: '#e879f9',
  },
  {
    id: 'marketingskills-buddy',
    image: playCover('marketingskills-buddy'),
    title: '营销技能 Buddy',
    titleEn: 'Marketing Skills Buddy',
    desc: '为增长团队提供持续更新的营销协作智能体，覆盖 CRO、文案、SEO、付费、邮件和增长决策。',
    descEn:
      'An always-current marketing copilot for CRO, copy, SEO, paid, email, and growth decisions.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '8.2k',
    accentColor: '#fb923c',
  },
  {
    id: 'scientific-skills-buddy',
    image: playCover('scientific-skills-buddy'),
    title: '科研技能 Buddy',
    titleEn: 'Scientific Skills Buddy',
    desc: '科研协作团队，覆盖数据分析、生物、化学、医学、可视化和科学写作。',
    descEn:
      'A scientific research team for data analysis, biology, chemistry, medicine, visualization, and writing.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '6.9k',
    accentColor: '#38bdf8',
  },
  {
    id: 'seomachine-buddy',
    image: playCover('seomachine-buddy'),
    title: 'SEO 机器 Buddy',
    titleEn: 'SEO Machine Buddy',
    desc: '将 seomachine playbook 转化为关键词研究、内容简报、站内审计和主题权威规划。',
    descEn:
      'Turns SEO playbooks into keyword research, content briefs, on-page audits, and topical authority plans.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '7.4k',
    accentColor: '#10b981',
  },
  {
    id: 'slavingia-skills-buddy',
    image: playCover('slavingia-skills-buddy'),
    title: 'Solo 技能 Buddy',
    titleEn: 'Solo Skills Buddy',
    desc: '为独立操作者配备高杠杆 AI 伙伴，用精选技能辅助写作、决策、设计品味和聚焦执行。',
    descEn:
      'A high-leverage AI partner for solo operators, applying curated skills to writing, decisions, taste, and focused execution.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '6.3k',
    accentColor: '#f59e0b',
  },
  {
    id: 'superclaude-buddy',
    image: playCover('superclaude-buddy'),
    title: 'SuperClaude Buddy',
    titleEn: 'SuperClaude Buddy',
    desc: '结构化开发工作台，支持角色分工、协作流程、质量检查和交付复盘。',
    descEn:
      'A structured development workbench for role-based collaboration, quality checks, and delivery retros.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '14.9k',
    accentColor: '#8b5cf6',
  },
  {
    id: 'superpowers-buddy',
    image: playCover('superpowers-buddy'),
    title: 'Superpowers 工程 Buddy',
    titleEn: 'Superpowers Engineering Buddy',
    desc: '围绕 Superpowers 工作流提供需求澄清、规格、TDD、计划、subagent 执行和代码审查能力。',
    descEn:
      'An engineering method for clarification, specs, TDD, planning, subagent execution, and code review discipline.',
    category: 'Buddy 团队',
    categoryEn: 'Buddy Teams',
    starts: '9.1k',
    accentColor: '#ef4444',
  },
  /* AI 陪伴 */
  {
    id: 'e-wife',
    image: playCover('e-wife'),
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

/* ─── Category metadata (order: 心理疗愈 > 世界资讯 > 互动游戏 > 黑客与画家 > Buddy 团队 > AI 陪伴) ─── */

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
    zh: 'Buddy 团队',
    en: 'Buddy Teams',
    label: '部署 · 自动化 · 专家协作',
    labelEn: 'Deploy · Automate · Specialist Teams',
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
    cover: topicCover('workplace-relief'),
    titleZh: '职场减压合集',
    titleEn: 'Workplace Relief',
    descZh: '打工人下班必备的解压神器合集',
    descEn: 'Wind-down essentials for after work',
    count: 12,
    accent: '#a78bfa',
  },
  {
    id: 'hacker-pack',
    cover: topicCover('hacker-pack'),
    titleZh: '程序员必玩',
    titleEn: 'Hacker Pack',
    descZh: '写代码的你，值得更好玩的工具',
    descEn: 'The best plays built for developers',
    count: 8,
    accent: '#34d399',
  },
  {
    id: 'night-radio',
    cover: topicCover('night-radio'),
    titleZh: '深夜电台',
    titleEn: 'Night Radio',
    descZh: '凌晨两点，聊聊那些不敢说的话',
    descEn: "Late-night conversations you can't have elsewhere",
    count: 6,
    accent: '#f472b6',
  },
]

/* ─── Remote config state (overrides static data at runtime) ─── */

// Module-level mutable references so all components share the same data
let _plays: Play[] = PLAYS
let _topics: Topic[] = TOPICS
let _categoryMeta: CategoryMeta[] = CATEGORY_META

// Subscriber pattern for hydration
type ConfigListener = () => void
const configListeners = new Set<ConfigListener>()
let configLoaded = false

async function loadRemoteConfig() {
  if (configLoaded) return
  configLoaded = true
  try {
    const [playsData, topicsData, categoryData] = await Promise.all([
      fetchPlayCatalog<Play[]>(PLAYS),
      fetchConfig<Topic[]>('homepage-topics', TOPICS),
      fetchConfig<CategoryMeta[]>('homepage-category-meta', CATEGORY_META),
    ])
    _plays = playsData
    _topics = topicsData
    _categoryMeta = categoryData
    for (const fn of configListeners) fn()
  } catch {}
}

function useRemoteData() {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const refresh = () => forceUpdate((n) => n + 1)
    configListeners.add(refresh)
    void loadRemoteConfig()
    return () => {
      configListeners.delete(refresh)
    }
  }, [])
  return { plays: _plays, topics: _topics, categoryMeta: _categoryMeta }
}

/* ─── Hero: Typing slogan (2 lines, loops) ─── */

function TypingSlogan({ isZh }: { isZh: boolean }) {
  const zhLines: [string, string] = ['你的 AI 小王国，', '与你常在']
  const enLines: [string, string] = ['Your AI Kingdom,', 'Always Here']
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
    const typingDelay = 82

    let idx = 0
    const type = () => {
      if (cancelRef.current) return
      idx++
      setCharIdx(idx)
      if (idx < totalLen) {
        setTimeout(type, typingDelay)
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
        height: '2.7em',
        minHeight: '2.7em',
        maxHeight: '2.7em',
        overflow: 'hidden',
      }}
    >
      <span style={{ display: 'block', height: '1.2em', lineHeight: 1.2, paddingLeft: '1em' }}>
        {line1}
        {showCursorOnLine1 && (
          <span className="hero-cursor" aria-hidden="true">
            _
          </span>
        )}
        {!showCursorOnLine1 && (
          <span className="hero-cursor" aria-hidden="true" style={{ visibility: 'hidden' }}>
            _
          </span>
        )}
      </span>
      <span style={{ display: 'block', height: '1.2em', lineHeight: 1.2 }}>
        {line2}
        {showCursorOnLine2 && (
          <span className={cursorClass} aria-hidden="true">
            _
          </span>
        )}
        {!showCursorOnLine2 && (
          <span className={cursorClass} aria-hidden="true" style={{ visibility: 'hidden' }}>
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

const FACE_TRANSFORMS = [
  'rotateY(0deg) translateZ(60px)',
  'rotateY(90deg) translateZ(60px)',
  'rotateX(90deg) translateZ(60px)',
  'rotateX(-90deg) translateZ(60px)',
  'rotateY(-90deg) translateZ(60px)',
  'rotateY(180deg) translateZ(60px)',
]

function DiceFace({ faceIdx }: { faceIdx: number }) {
  const pips = PIPS[faceIdx]
  const SIZE = 120
  const PAD = 15
  const CELL = 30
  const PIP = 14

  const getPipStyle = (pipIdx: number) => {
    if (faceIdx === 1) {
      const isYellow = pipIdx === 0
      return {
        background: isYellow ? '#f8e71c' : '#00f3ff',
        boxShadow: isYellow ? '0 0 10px rgba(248,231,28,0.95)' : '0 0 10px rgba(0,243,255,0.95)',
      }
    }
    return {
      background: 'var(--shadow-accent)',
      boxShadow: '0 0 8px rgba(0,243,255,0.9)',
    }
  }

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
              left: `${PAD + col * CELL + (CELL - PIP) / 2}px`,
              top: `${PAD + row * CELL + (CELL - PIP) / 2}px`,
              ...getPipStyle(i),
            }}
          />
        ))}
      </div>
    </div>
  )
}

function DiceSection({ isZh }: { isZh: boolean }) {
  const t = useI18n()
  const [rolling, setRolling] = useState(false)
  const [modalPlay, setModalPlay] = useState<Play | null>(null)
  const rotRef = useRef({ x: -15, y: 25 })
  const [diceRot, setDiceRot] = useState({ x: -15, y: 25 })

  const rollDice = () => {
    if (rolling) return
    setModalPlay(null)
    setRolling(true)

    const spinsX = 1440 + Math.random() * 720
    const spinsY = 1080 + Math.random() * 720
    rotRef.current = { x: rotRef.current.x + spinsX, y: rotRef.current.y + spinsY }
    setDiceRot({ ...rotRef.current })

    setTimeout(() => {
      const randomPlay = _plays[Math.floor(Math.random() * _plays.length)]
      setModalPlay(randomPlay)
      setRolling(false)
    }, 2000)
  }

  return (
    <>
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
          <span className="section-label section-label-inline">
            <Dice5 size={15} strokeWidth={2.7} />
            {t('home.random.label')}
          </span>
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
            {t('home.random.title')}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--shadow-text-muted)',
              fontWeight: 600,
              marginBottom: '40px',
            }}
          >
            {t('home.random.subtitle')}
          </p>

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
            aria-label={t('home.random.rollAria')}
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
              {t('home.random.rolling')}
            </p>
          )}

          {!rolling && (
            <button
              type="button"
              className="btn-secondary"
              onClick={rollDice}
              style={{ fontSize: '13px', padding: '12px 28px', gap: '8px' }}
            >
              <Dice5 size={16} strokeWidth={2.8} />
              {t('home.random.roll')}
            </button>
          )}
        </div>
      </section>

      {/* Dice result modal */}
      {modalPlay && !rolling && (
        <DiceModal
          play={modalPlay}
          isZh={isZh}
          onClose={() => setModalPlay(null)}
          onRollAgain={() => {
            setModalPlay(null)
            rollDice()
          }}
        />
      )}
    </>
  )
}

/* ─── Dice result modal with confetti ─── */

const CONFETTI_COLORS = [
  '#00f3ff',
  '#f8e71c',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fb923c',
  '#f87171',
]

function fireConfetti() {
  const end = Date.now() + 1800
  const frame = () => {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors: CONFETTI_COLORS,
    })
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors: CONFETTI_COLORS,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

function DiceModal({
  play,
  isZh,
  onClose,
  onRollAgain,
}: {
  play: Play
  isZh: boolean
  onClose: () => void
  onRollAgain: () => void
}) {
  const t = useI18n()
  const title = isZh ? play.title : play.titleEn
  const desc = isZh ? play.desc : play.descEn
  const category = isZh ? play.category : play.categoryEn

  useEffect(() => {
    fireConfetti()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5,5,8,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'modalFadeIn 0.22s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'var(--rp-c-bg, #12121a)',
          border: '1px solid rgba(0,243,255,0.22)',
          borderRadius: '32px',
          maxWidth: '460px',
          width: '100%',
          overflow: 'hidden',
          animation: 'modalSlideUp 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 48px rgba(0,243,255,0.08)',
        }}
      >
        {/* Image */}
        <div style={{ position: 'relative', height: '220px', overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={play.image}
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, transparent 40%, rgba(5,5,8,0.88) 100%)',
            }}
          />
          {/* Win badge */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              background: 'linear-gradient(135deg, #f8e71c, #ffb300)',
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 900,
              color: '#050508',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Dice5 size={13} strokeWidth={3} />
            {t('home.random.result')}
          </div>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '32px',
              height: '32px',
              background: 'rgba(5,5,8,0.55)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%',
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={17} strokeWidth={2.6} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px 28px' }}>
          <CategoryBadge label={category} color={play.accentColor} />
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 900,
              color: 'var(--rp-c-text-1)',
              marginBottom: '10px',
              fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
              lineHeight: 1.2,
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--shadow-text-muted)',
              fontWeight: 600,
              lineHeight: 1.75,
              marginBottom: '24px',
            }}
          >
            {desc}
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <PlayLaunchCta
              play={play}
              isZh={isZh}
              style={{
                flex: 1,
                justifyContent: 'center',
              }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={onRollAgain}
              style={{ flex: 1, justifyContent: 'center', gap: '8px' }}
            >
              <RotateCcw size={15} strokeWidth={2.7} />
              {t('home.random.again')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Dice section ─── */

function CategoryBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        alignSelf: 'flex-start',
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
  const cardRef = useRef<HTMLDivElement>(null)

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    cardRef.current!.style.transition = 'transform 0.08s ease'
    cardRef.current!.style.transform = `perspective(800px) rotateX(${y * -7}deg) rotateY(${x * 7}deg) translateY(-4px) scale(1.01)`
  }

  const handleLeave = () => {
    if (!cardRef.current) return
    cardRef.current.style.transition = 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    cardRef.current.style.transform = ''
  }

  return (
    <div
      ref={cardRef}
      className="glass-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        willChange: 'transform',
        height: '100%',
        minHeight: '438px',
      }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
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
            minHeight: '1.35em',
          }}
          className="home-card-title"
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
          className="home-card-desc"
        >
          {desc}
        </p>
        <PlayLaunchCta
          play={play}
          isZh={isZh}
          short
          style={{
            width: '100%',
            justifyContent: 'center',
            marginTop: 'auto',
          }}
        />
      </div>
    </div>
  )
}

/* ─── Featured carousel (3 hot plays, 3 columns) ─── */

function FeaturedCarousel({ isZh }: { isZh: boolean }) {
  const t = useI18n()
  const featured = _plays.filter((p) => p.hot)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const pauseRef = useRef(false)
  const setCarouselPaused = useCallback((nextPaused: boolean) => {
    pauseRef.current = nextPaused
    setPaused(nextPaused)
  }, [])

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (featured.length <= 1) return
    const t = setInterval(() => {
      if (!pauseRef.current) setActive((a: number) => (a + 1) % featured.length)
    }, 5000)
    return () => clearInterval(t)
  }, [featured.length])

  const prev = () => setActive((a: number) => (a - 1 + featured.length) % featured.length)
  const next = () => setActive((a: number) => (a + 1) % featured.length)

  const play = featured[active]
  if (!play) return null

  const title = isZh ? play.title : play.titleEn
  const desc = isZh ? play.desc : play.descEn
  const category = isZh ? play.category : play.categoryEn

  const arrowBtn: React.CSSProperties = {
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
    flexShrink: 0,
  }

  return (
    <section
      style={{ marginBottom: '56px' }}
      onPointerEnter={() => setCarouselPaused(true)}
      onPointerLeave={() => setCarouselPaused(false)}
      onFocusCapture={() => setCarouselPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setCarouselPaused(false)
        }
      }}
      aria-live={paused ? 'polite' : 'off'}
    >
      <div style={{ marginBottom: '20px' }}>
        <span className="section-label section-label-inline">
          <Sparkles size={15} strokeWidth={2.7} />
          {t('home.featured.eyebrow')}
        </span>
        <h2
          style={{
            fontSize: '26px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: 'var(--rp-c-text-1)',
            fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
          }}
        >
          {t('home.featured.title')}
        </h2>
      </div>

      {/* Large card wrapper — full-bleed cinema style */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: 0,
          borderRadius: '32px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
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
                fontSize: 'clamp(26px, 3vw, 42px)',
                fontWeight: 900,
                color: '#fff',
                marginBottom: '14px',
                lineHeight: 1.15,
                fontFamily: '"Nunito", "Noto Sans SC", sans-serif',
                textShadow: '0 2px 16px rgba(0,0,0,0.5)',
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: '15px',
                color: 'rgba(255,255,255,0.75)',
                fontWeight: 600,
                lineHeight: 1.75,
                marginBottom: '32px',
                maxWidth: '520px',
              }}
            >
              {desc}
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <PlayLaunchCta
                play={play}
                isZh={isZh}
                style={{
                  fontSize: '15px',
                  padding: '12px 28px',
                }}
              />
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                {play.starts} {t('home.launches')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls: prev arrow + dots + next arrow */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          marginTop: '16px',
        }}
      >
        <button type="button" aria-label="Previous" onClick={prev} style={arrowBtn}>
          <ChevronLeft size={22} strokeWidth={2.7} />
        </button>
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
        <button type="button" aria-label="Next" onClick={next} style={arrowBtn}>
          <ChevronRight size={22} strokeWidth={2.7} />
        </button>
      </div>
    </section>
  )
}

/* ─── Topic card + Featured Topics section (专题) ─── */

function TopicCard({ topic, isZh }: { topic: Topic; isZh: boolean }) {
  const t = useI18n()
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
            {topic.count} {t('home.plays')}
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
  const t = useI18n()
  return (
    <section style={{ marginBottom: '56px' }}>
      <div style={{ marginBottom: '20px' }}>
        <span className="section-label">
          <Sparkles size={15} strokeWidth={2.7} />
          {t('home.topics.eyebrow')}
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
          {t('home.topics.title')}
        </h2>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}
        className="home-topics-grid"
      >
        {_topics.map((topic, i) => (
          <ScrollReveal key={topic.id} delay={i * 100}>
            <TopicCard topic={topic} isZh={isZh} />
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}

/* ─── Category section ─── */

function CategorySection({ meta, isZh }: { meta: CategoryMeta; isZh: boolean }) {
  const t = useI18n()
  const plays = _plays.filter((p) => (isZh ? p.category === meta.zh : p.categoryEn === meta.en))
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {t('home.viewAll')}
          <ChevronRight size={15} strokeWidth={2.8} />
        </a>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '20px',
        }}
      >
        {plays.map((play, i) => (
          <ScrollReveal key={play.id} delay={i * 70}>
            <PlayCard play={play} isZh={isZh} />
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}

/* ─── Right sidebar: Leaderboard + Editor's Picks ─── */

function Leaderboard({ isZh }: { isZh: boolean }) {
  const t = useI18n()
  const rankColors = [
    'linear-gradient(135deg, #f8e71c, #ffb300)', // Gold
    'linear-gradient(135deg, #e2e8f0, #94a3b8)', // Silver
    'linear-gradient(135deg, #ffedd5, #f97316)', // Bronze
  ]
  const rankTextColors = ['#451a03', '#0f172a', '#7c2d12']

  return (
    <div style={{ marginBottom: '32px' }}>
      <span className="section-label" style={{ color: '#FF2A55' }}>
        <Flame size={15} strokeWidth={2.8} />
        {t('home.trending.eyebrow')}
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
        {t('home.trending.title')}
      </h2>
      <div
        className="glass-card"
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        {_plays.slice(0, 5).map((play, i) => (
          <div
            key={play.id}
            className="leaderboard-row"
            style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'center',
              padding: '12px',
              borderRadius: '20px',
              border: '1px solid',
              borderColor: i === 0 ? 'rgba(0, 198, 209, 0.25)' : 'var(--shadow-card-border)',
              cursor: 'pointer',
              background:
                i === 0
                  ? 'linear-gradient(135deg, rgba(0,198,209,0.06), transparent)'
                  : 'transparent',
              transition: 'all 0.3s var(--bezier-bouncy)',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '64px',
                height: '64px',
                flexShrink: 0,
              }}
            >
              <img
                src={play.image}
                alt={isZh ? play.title : play.titleEn}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  objectFit: 'cover',
                  border:
                    i === 0
                      ? '2px solid rgba(0, 198, 209, 0.4)'
                      : '1px solid rgba(255,255,255,0.16)',
                  boxShadow:
                    i === 0 ? '0 8px 20px rgba(0,198,209,0.15)' : '0 8px 18px rgba(0,0,0,0.1)',
                }}
                loading="lazy"
              />
              <div
                className="leaderboard-rank-badge"
                style={{
                  position: 'absolute',
                  left: '-10px',
                  top: '-10px',
                  width: '30px',
                  height: '30px',
                  borderRadius: '12px',
                  background: i < 3 ? rankColors[i] : 'var(--rp-c-bg)',
                  border:
                    i < 3
                      ? '1px solid rgba(255,255,255,0.5)'
                      : '2px solid var(--shadow-card-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '14px',
                  color: i < 3 ? rankTextColors[i] : 'var(--shadow-text-muted)',
                  boxShadow: i < 3 ? '0 4px 10px rgba(0,0,0,0.15)' : undefined,
                  zIndex: 2,
                }}
              >
                {i === 0 ? <Crown size={16} fill="currentColor" strokeWidth={2.5} /> : i + 1}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: '15px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{ fontSize: '12px', fontWeight: 800, color: 'var(--shadow-text-muted)' }}
                >
                  {play.starts} {t('home.launches')}
                </span>
                {i === 0 && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 900,
                      color: '#00C6D1',
                      background: 'rgba(0,198,209,0.1)',
                      padding: '2px 6px',
                      borderRadius: '6px',
                    }}
                  >
                    HOT
                  </span>
                )}
              </div>
            </div>
            {i === 0 && (
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  background: '#00E676',
                  borderRadius: '50%',
                  boxShadow: '0 0 12px rgba(0,230,118,0.8)',
                  flexShrink: 0,
                  marginRight: '4px',
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
  const t = useI18n()
  const picks = _plays.slice(0, 3)
  return (
    <div>
      <span className="section-label section-label-inline">
        <Sparkles size={15} strokeWidth={2.7} />
        {t('home.editor.eyebrow')}
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
        {t('home.editor.title')}
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
              style={{ fontSize: '11px', padding: '6px 12px', flexShrink: 0, gap: '6px' }}
            >
              <Play size={12} fill="currentColor" strokeWidth={2.8} />
              {t('home.go')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── DIY Cloud prompt ─── */

function DiyPromptSection({ isZh }: { isZh: boolean }) {
  const t = useI18n()
  const [prompt, setPrompt] = useState('')
  const [immersive, setImmersive] = useState(false)
  const [closing, setClosing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [typedPlaceholder, setTypedPlaceholder] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalTextareaRef = useRef<HTMLTextAreaElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const trimmed = prompt.trim()

  const examples = useMemo(() => {
    const groups = isZh
      ? [
          {
            tag: '增长',
            items: [
              ['竞品与周报', '帮我搭一个每天整理竞品、生成增长周报、能接 Google Drive 的空间'],
              ['SEO 作战室', '给独立站做一个 SEO 增长空间，监控关键词、页面改动和内容机会'],
              ['线索跟进', '创建销售线索跟进空间，汇总表单、邮件和待办，每天提醒最该推进的人'],
              ['投放复盘', '搭一个投放复盘空间，整理素材表现、花费异常和下周实验计划'],
              ['用户访谈', '做一个用户访谈分析空间，沉淀录音摘要、痛点标签和产品机会'],
              ['转化漏斗', '创建转化漏斗诊断空间，追踪注册、激活、付费和流失原因'],
              ['社群增长', '搭一个社群增长空间，整理群内问题、热门话题和可复用回复'],
              ['上新节奏', '为电商团队生成上新作战室，协调选品、素材、库存和复盘'],
            ],
          },
          {
            tag: '科研',
            items: [
              ['阅读与论文', '创建一个科研助手空间，能检索资料、沉淀论文笔记，并生成每周阅读简报'],
              ['课题追踪', '搭一个课题追踪空间，记录研究假设、实验进展和下一步问题'],
              ['文献综述', '帮我建立文献综述空间，按主题归档论文、方法、数据集和争议点'],
              ['实验日志', '创建实验日志空间，跟踪参数、结果、失败原因和复现实验步骤'],
              ['基金申请', '搭一个基金申请协作空间，整理立项依据、预算说明和材料清单'],
              ['论文写作', '生成论文写作空间，管理大纲、引用、图表和审稿回复'],
              ['读书小组', '创建研究小组空间，每周分配阅读任务并生成讨论问题'],
              ['数据标注', '搭一个数据标注质检空间，检查样本一致性、争议样本和标注规范'],
            ],
          },
          {
            tag: '独立开发',
            items: [
              ['产品作战室', '给独立开发者做一个产品增长作战室，跟踪站点 SEO、转化线索和待办'],
              ['MVP 冲刺', '搭一个 MVP 冲刺空间，把需求、技术债、发布清单和用户反馈串起来'],
              ['Bug 收敛', '创建 Bug 收敛空间，读取 GitHub Issue、归因重复问题并安排修复优先级'],
              ['定价实验', '帮我做定价实验空间，记录套餐假设、用户异议和转化数据'],
              ['发布雷达', '搭一个发布雷达空间，追踪 Product Hunt、社区反馈和媒体线索'],
              ['用户支持', '创建早期用户支持空间，把反馈、工单和路线图建议合并整理'],
              ['竞品雷达', '给 SaaS 做竞品雷达，监控版本更新、定价变化和差异化机会'],
              ['投资人更新', '搭一个月度投资人更新空间，自动汇总指标、进展、风险和需求'],
            ],
          },
          {
            tag: '客服',
            items: [
              ['知识库 Buddy', '搭一个客服知识库 Buddy，能读取文档、回答常见问题，并提示缺失资料'],
              ['工单分流', '创建工单分流空间，识别紧急问题、退款诉求和需要人工介入的对话'],
              ['退款挽留', '搭一个退款挽留空间，总结流失原因并生成可执行的补救方案'],
              ['新人客服', '建立客服培训空间，用真实案例训练新人回答、升级和记录问题'],
              ['质量抽检', '创建客服质检空间，抽查对话是否准确、礼貌、按流程处理'],
              ['多语言支持', '搭一个多语言客服空间，把英文问题翻译、归类并生成中文处理建议'],
              ['故障通报', '创建故障响应空间，汇总用户影响、状态页文案和补偿建议'],
              ['FAQ 更新', '做一个 FAQ 更新空间，从重复问题里提炼新文档和产品改进线索'],
            ],
          },
          {
            tag: '设计',
            items: [
              ['设计评审', '创建一个设计评审空间，接入 Figma 链接，输出可执行的 UI 修改建议'],
              ['品牌资产', '搭一个品牌资产空间，整理 Logo、色彩、字体、语气和使用边界'],
              ['落地页审查', '创建落地页审查空间，检查首屏信息、转化路径和视觉层次'],
              ['组件质检', '建立设计系统质检空间，发现组件不一致、状态缺失和文案溢出'],
              ['用户旅程', '搭一个用户旅程空间，整理关键触点、情绪波动和改版机会'],
              ['图标审核', '创建图标审核空间，检查语义、尺寸、线宽和跨端一致性'],
              ['广告素材', '做一个广告素材评审空间，按人群、卖点和视觉冲击力打分'],
              ['无障碍检查', '搭一个无障碍检查空间，审查对比度、焦点状态和键盘路径'],
            ],
          },
          {
            tag: '财务',
            items: [
              ['现金流复盘', '搭一个个人财务复盘空间，整理账单、预算和每周现金流提醒'],
              ['报销助手', '创建报销整理空间，归档发票、检查缺项并生成提交清单'],
              ['订阅巡检', '搭一个订阅巡检空间，发现闲置 SaaS、重复扣费和续费风险'],
              ['团队预算', '创建团队预算空间，跟踪项目花费、采购审批和余额预警'],
              ['应收跟进', '搭一个应收账款跟进空间，提醒逾期客户并生成催款记录'],
              ['税务材料', '建立税务材料准备空间，整理收入、成本、合同和凭证缺口'],
              ['家庭账本', '创建家庭账本空间，每周总结消费结构和节省建议'],
              ['投资记录', '搭一个投资复盘空间，记录买卖理由、风险假设和复盘提醒'],
            ],
          },
          {
            tag: '项目',
            items: [
              ['项目战情室', '创建一个项目战情室，能看 GitHub Issue、沉淀决策并提醒阻塞项'],
              ['周会助手', '搭一个周会空间，汇总进展、风险、依赖和会后行动项'],
              ['上线清单', '创建上线清单空间，追踪测试、灰度、回滚和公告准备'],
              ['跨团队协作', '搭一个跨团队项目空间，把需求、设计、工程和运营同步到一个节奏'],
              ['客户交付', '创建客户交付空间，管理里程碑、验收材料和风险沟通'],
              ['招聘流程', '搭一个招聘项目空间，跟踪候选人、面试反馈和 Offer 进度'],
              ['活动筹备', '创建活动筹备空间，管理嘉宾、物料、宣传和现场清单'],
              ['OKR 跟踪', '搭一个 OKR 跟踪空间，把目标、关键结果和每周更新串起来'],
            ],
          },
          {
            tag: '内容',
            items: [
              ['内容运营', '帮我做一个内容运营空间，追踪选题、资料、发布排期和复盘'],
              ['短视频脚本', '搭一个短视频脚本空间，从热点、素材和产品卖点生成脚本'],
              ['播客制作', '创建播客制作空间，整理嘉宾资料、采访提纲和发布文案'],
              ['Newsletter', '搭一个 Newsletter 空间，收集链接、提炼观点并生成每周邮件'],
              ['知识星球', '创建社群内容空间，整理成员问题、课程更新和答疑素材'],
              ['案例研究', '搭一个客户案例空间，沉淀访谈、成效数据和发布版本'],
              ['社媒日历', '创建社媒排期空间，管理平台差异、素材状态和复盘指标'],
              ['课程研发', '搭一个课程研发空间，规划大纲、作业、案例和学员反馈'],
            ],
          },
        ]
      : [
          {
            tag: 'Growth',
            items: [
              [
                'Competitor Briefs',
                'Build a growth space that monitors competitors, drafts weekly reports, and connects Google Drive',
              ],
              [
                'SEO Room',
                'Create an SEO room that tracks keywords, page changes, content gaps, and publishing tasks',
              ],
              [
                'Lead Follow-up',
                'Build a lead follow-up space that summarizes forms, emails, objections, and next actions',
              ],
              [
                'Campaign Review',
                'Set up a campaign review room for spend anomalies, creative performance, and next experiments',
              ],
              [
                'User Interviews',
                'Create an interview analysis space that tags pain points and extracts product opportunities',
              ],
              [
                'Activation Funnel',
                'Build a funnel diagnosis room for signup, activation, payment, and churn reasons',
              ],
              [
                'Community Growth',
                'Set up a community growth room that detects repeated questions and reusable replies',
              ],
              [
                'Launch Calendar',
                'Create an ecommerce launch room for products, inventory, assets, and post-launch review',
              ],
            ],
          },
          {
            tag: 'Research',
            items: [
              [
                'Reading Room',
                'Create a research assistant space that finds sources, keeps paper notes, and writes a weekly reading brief',
              ],
              [
                'Thesis Tracker',
                'Build a thesis tracker for hypotheses, experiments, blockers, and next research questions',
              ],
              [
                'Literature Review',
                'Create a literature review room organized by topics, methods, datasets, and disputes',
              ],
              [
                'Experiment Log',
                'Set up an experiment log for parameters, results, failures, and reproducibility notes',
              ],
              [
                'Grant Drafting',
                'Build a grant workspace for rationale, budget notes, collaborators, and missing materials',
              ],
              [
                'Paper Writing',
                'Create a paper-writing room for outline, citations, figures, and reviewer responses',
              ],
              [
                'Reading Group',
                'Set up a reading-group room with assignments, summaries, and weekly discussion prompts',
              ],
              [
                'Data Labeling',
                'Create a labeling QA room for consistency checks, disputed samples, and guidelines',
              ],
            ],
          },
          {
            tag: 'Founder',
            items: [
              [
                'Product War Room',
                'Set up an indie founder growth room for SEO, conversion leads, and action tracking',
              ],
              [
                'MVP Sprint',
                'Create an MVP sprint room that connects requirements, tech debt, releases, and feedback',
              ],
              [
                'Bug Triage',
                'Build a bug triage room that reads GitHub issues, clusters duplicates, and prioritizes fixes',
              ],
              [
                'Pricing Lab',
                'Set up a pricing experiment room for package hypotheses, objections, and conversion signals',
              ],
              [
                'Launch Radar',
                'Create a launch radar for Product Hunt, community feedback, and press leads',
              ],
              [
                'Early Support',
                'Build an early-user support room that merges feedback, tickets, and roadmap ideas',
              ],
              [
                'Competitor Radar',
                'Set up a SaaS competitor radar for release notes, pricing changes, and positioning gaps',
              ],
              [
                'Investor Update',
                'Create a monthly investor update room for metrics, progress, risks, and asks',
              ],
            ],
          },
          {
            tag: 'Support',
            items: [
              [
                'Knowledge Buddy',
                'Create a support knowledge-base Buddy that reads docs, answers FAQs, and flags missing material',
              ],
              [
                'Ticket Routing',
                'Build a ticket routing room that detects urgent issues, refunds, and handoff needs',
              ],
              [
                'Refund Recovery',
                'Create a refund recovery room that summarizes churn reasons and suggests save offers',
              ],
              [
                'Agent Training',
                'Set up a support training room using real cases for replies, escalation, and notes',
              ],
              [
                'QA Review',
                'Build a support QA room that audits accuracy, tone, and process compliance',
              ],
              [
                'Multilingual Support',
                'Create a multilingual support room that translates, classifies, and drafts responses',
              ],
              [
                'Incident Comms',
                'Set up an incident response room for impact summary, status updates, and compensation notes',
              ],
              [
                'FAQ Updates',
                'Build an FAQ update room that turns repeated questions into docs and product insights',
              ],
            ],
          },
          {
            tag: 'Design',
            items: [
              [
                'Design Review',
                'Build a design review space that reads Figma links and returns actionable UI fixes',
              ],
              [
                'Brand Assets',
                'Create a brand asset room for logo, colors, typography, voice, and usage rules',
              ],
              [
                'Landing Audit',
                'Set up a landing-page audit room for first-screen clarity, conversion path, and hierarchy',
              ],
              [
                'Component QA',
                'Build a design-system QA room for inconsistent components, missing states, and overflow',
              ],
              [
                'Journey Map',
                'Create a user journey room for key touchpoints, emotions, and redesign opportunities',
              ],
              [
                'Icon Review',
                'Set up an icon review room for meaning, size, stroke, and cross-platform consistency',
              ],
              [
                'Ad Creative',
                'Build an ad creative review room that scores audience fit, message, and visual impact',
              ],
              [
                'Accessibility',
                'Create an accessibility audit room for contrast, focus states, and keyboard paths',
              ],
            ],
          },
          {
            tag: 'Finance',
            items: [
              [
                'Cash Review',
                'Create a personal finance review space for bills, budget, and weekly cash-flow reminders',
              ],
              [
                'Expense Prep',
                'Build an expense room that organizes receipts, checks gaps, and prepares submission notes',
              ],
              [
                'Subscription Audit',
                'Create a subscription audit room for unused tools, duplicate billing, and renewals',
              ],
              [
                'Team Budget',
                'Set up a team budget room for project spend, approvals, and low-balance warnings',
              ],
              [
                'Receivables',
                'Build an AR follow-up room for overdue customers, reminders, and payment notes',
              ],
              [
                'Tax Prep',
                'Create a tax material room for income, costs, contracts, and missing evidence',
              ],
              [
                'Family Ledger',
                'Set up a household ledger room with weekly spend summaries and saving suggestions',
              ],
              [
                'Investment Journal',
                'Build an investment journal room for trade rationale, risk assumptions, and reviews',
              ],
            ],
          },
          {
            tag: 'Project',
            items: [
              [
                'Project Room',
                'Create a project war room that reads GitHub issues, records decisions, and flags blockers',
              ],
              [
                'Weekly Sync',
                'Build a weekly sync room for progress, risks, dependencies, and follow-up tasks',
              ],
              [
                'Release Checklist',
                'Create a release room for QA, rollout, rollback, and announcement readiness',
              ],
              [
                'Cross-team Work',
                'Set up a cross-team room connecting requirements, design, engineering, and ops',
              ],
              [
                'Client Delivery',
                'Build a client delivery room for milestones, acceptance materials, and risks',
              ],
              [
                'Hiring Pipeline',
                'Create a hiring project room for candidates, interview feedback, and offer progress',
              ],
              [
                'Event Planning',
                'Set up an event room for speakers, assets, promotion, and run-of-show details',
              ],
              [
                'OKR Tracking',
                'Build an OKR tracking room that connects goals, key results, and weekly updates',
              ],
            ],
          },
          {
            tag: 'Content',
            items: [
              [
                'Content Ops',
                'Build a content operations space for topics, sources, publishing calendar, and retros',
              ],
              [
                'Video Scripts',
                'Create a short-video script room from trends, assets, and product angles',
              ],
              [
                'Podcast Production',
                'Set up a podcast room for guest research, interview outlines, and launch copy',
              ],
              [
                'Newsletter',
                'Build a newsletter room that collects links, extracts views, and drafts weekly emails',
              ],
              [
                'Community Content',
                'Create a community content room for member questions, updates, and answer material',
              ],
              [
                'Case Studies',
                'Set up a case-study room for interviews, proof points, and publishable stories',
              ],
              [
                'Social Calendar',
                'Build a social calendar room for channel variants, asset status, and metrics review',
              ],
              [
                'Course Design',
                'Create a course design room for syllabus, assignments, cases, and learner feedback',
              ],
            ],
          },
        ]

    return groups.flatMap(({ tag, items }) => items.map(([title, text]) => ({ tag, title, text })))
  }, [isZh])
  const placeholderExamples = useMemo(() => examples.slice(0, 4), [examples])
  const categories = useMemo(
    () => [
      { id: 'all', label: t('home.diy.all') },
      ...Array.from(new Set(examples.map((item) => item.tag))).map((tag) => ({
        id: tag,
        label: tag,
      })),
    ],
    [examples, isZh],
  )

  const visibleExamples = useMemo(() => {
    const filtered =
      selectedCategory === 'all'
        ? examples
        : examples.filter((item) => item.tag === selectedCategory)

    const normalized = trimmed.toLowerCase()
    if (!normalized) return filtered

    return filtered.filter(
      (item) =>
        item.text.toLowerCase().includes(normalized) ||
        item.title.toLowerCase().includes(normalized) ||
        item.tag.toLowerCase().includes(normalized),
    )
  }, [examples, selectedCategory, trimmed])

  const placeholder = typedPlaceholder

  useEffect(() => {
    const current = placeholderExamples[placeholderIndex % placeholderExamples.length]?.text ?? ''
    setTypedPlaceholder('')
    let index = 0
    const typeTimer = window.setInterval(() => {
      index += 1
      setTypedPlaceholder(current.slice(0, index))
      if (index >= current.length) window.clearInterval(typeTimer)
    }, 32)
    const nextTimer = window.setTimeout(
      () => {
        setPlaceholderIndex((value) => (value + 1) % placeholderExamples.length)
      },
      Math.max(3200, current.length * 32 + 1200),
    )
    return () => {
      window.clearInterval(typeTimer)
      window.clearTimeout(nextTimer)
    }
  }, [placeholderIndex, placeholderExamples])

  const submitPrompt = (submitText: string) => {
    const textToSubmit = submitText.trim()
    if (!textToSubmit) return
    const targetUrl = `/app/cloud/diy?prompt=${encodeURIComponent(textToSubmit)}`
    if (!hasStoredAuthSession()) {
      requestWebsiteLogin(targetUrl)
      return
    }
    window.location.assign(targetUrl)
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitPrompt(trimmed)
  }

  const closeImmersive = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      setImmersive(false)
      setClosing(false)
      closeTimerRef.current = null
    }, 200)
  }, [])

  const openImmersive = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setImmersive(true)
    setClosing(false)
    window.setTimeout(() => {
      modalTextareaRef.current?.focus({ preventScroll: true })
    }, 50)
  }, [])

  useEffect(() => {
    if (!immersive) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeImmersive()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeImmersive, immersive])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  const immersivePortal =
    immersive && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={['home-diy-cmd-overlay', closing ? 'closing' : ''].filter(Boolean).join(' ')}
            onMouseDown={closeImmersive}
          >
            <div className="home-diy-cmd-modal" onMouseDown={(e) => e.stopPropagation()}>
              <form className="home-diy-cmd-header" onSubmit={onSubmit}>
                <WandSparkles size={20} strokeWidth={2.5} className="home-diy-cmd-icon" />
                <textarea
                  ref={modalTextareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={placeholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      onSubmit(e as any)
                    }
                  }}
                  rows={2}
                />
                <button
                  type="submit"
                  className="btn-primary home-diy-cmd-submit"
                  disabled={!trimmed}
                >
                  {t('home.diy.submit')}
                </button>
              </form>
              <div className="home-diy-cmd-body">
                <div className="home-diy-cmd-tabs">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={selectedCategory === category.id ? 'active' : ''}
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <div className="home-diy-cmd-grid">
                  {visibleExamples.map((item) => (
                    <button
                      key={item.text}
                      type="button"
                      className="home-diy-cmd-card"
                      onClick={() => {
                        setPrompt(item.text)
                        modalTextareaRef.current?.focus()
                      }}
                    >
                      <div className="home-diy-cmd-card-header">
                        <strong>{item.title}</strong>
                        <span className="home-diy-cmd-tag">{item.tag}</span>
                      </div>
                      <p>{item.text}</p>
                    </button>
                  ))}
                  {visibleExamples.length === 0 && (
                    <div className="home-diy-cmd-empty">
                      No matching examples found. Try a different search.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <section className="home-diy-shell">
      <div className="home-diy-inline-container">
        <div className="home-diy-copy">
          <span className="section-label section-label-inline">
            <WandSparkles size={15} strokeWidth={2.7} />
            {t('home.diy.label')}
          </span>
          <h2>{t('home.diy.title')}</h2>
          <p>{t('home.diy.description')}</p>
        </div>
        <div className="home-diy-inline-form" onClick={openImmersive}>
          <div className="home-diy-inline-input">
            <Search size={22} strokeWidth={2.5} />
            <span>
              {prompt || placeholder}
              {!prompt && <span className="home-diy-cursor" />}
            </span>
          </div>
          <div className="home-diy-inline-actions">
            <button
              className="btn-primary"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const text =
                  prompt ||
                  placeholderExamples[placeholderIndex % placeholderExamples.length]?.text ||
                  ''
                submitPrompt(text)
              }}
            >
              {t('home.diy.submit')}
            </button>
          </div>
        </div>
      </div>
      {immersivePortal}
    </section>
  )
}

/* ─── Developer CTA ─── */

function DevCta({ isZh }: { isZh: boolean }) {
  const t = useI18n()
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
          <span className="section-label section-label-inline">
            <Lightbulb size={15} strokeWidth={2.7} />
            {t('home.dev.label')}
          </span>
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
            {t('home.dev.title')}
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
            {t('home.dev.description')}
          </p>
        </div>
        <a
          href={`${prefix}/platform/introduction`}
          className="btn-primary"
          style={{
            textDecoration: 'none',
            flexShrink: 0,
            fontSize: '14px',
            padding: '14px 28px',
            gap: '8px',
          }}
        >
          <Trophy size={16} strokeWidth={2.7} />
          {t('home.dev.cta')}
        </a>
      </div>
    </section>
  )
}

/* ─── Main export ─── */

export function HomeContent({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const t = useI18n()
  const isZh = lang === 'zh'
  const { plays, topics, categoryMeta } = useRemoteData()

  // Override module-level references so child components use fresh data
  _plays = plays
  _topics = topics
  _categoryMeta = categoryMeta

  return (
    <div className="shadow-page" style={{ minHeight: '100vh' }}>
      {/* ── Hero ── */}
      <section
        style={{
          textAlign: 'center',
          height: '520px',
          minHeight: '520px',
          maxHeight: '520px',
          padding: '0 20px',
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '1400px',
          margin: '0 auto',
          overflow: 'hidden',
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
          {t('home.hero.eyebrow')}
        </p>

        <TypingSlogan isZh={isZh} />

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="/app"
            className="btn-secondary"
            style={{ textDecoration: 'none', gap: '8px' }}
            onClick={handleAppEntryClick}
          >
            <Sparkles size={15} strokeWidth={2.7} />
            {t('home.hero.cta')}
          </a>
        </div>
      </section>

      <DiyPromptSection isZh={isZh} />

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
          {_categoryMeta.map((meta) => (
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
