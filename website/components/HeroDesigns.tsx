import { useEffect, useState } from 'react'
import {
  BoltIcon,
  BookIcon,
  BuddyIcon,
  ChatIcon,
  PawIcon,
  SparkleIcon,
  StoreIcon,
  UsersIcon,
} from './Icons'

type Locale = 'zh' | 'en'

/* ── Scene data types ── */
interface ChatMsg {
  name: string
  text: string
  isAI: boolean
  color: string
}
interface BuddyCard {
  name: string
  skills: string
  rate: string
  rating: string
  color: string
}
interface ShopItem {
  name: string
  desc: string
  price: string
  color: string
}
interface TermLine {
  prefix?: string
  text: string
  color: string
}
interface AppCard {
  name: string
  desc: string
  icon: string
  color: string
}
interface BuddyProfile {
  name: string
  personality: string
  memory: string
  level: string
  color: string
}

type Scene =
  | { type: 'chat'; title: string; accentColor: string; msgs: ChatMsg[]; actionLabel: string }
  | {
      type: 'market'
      title: string
      accentColor: string
      buddies: BuddyCard[]
      actionLabel: string
    }
  | { type: 'shop'; title: string; accentColor: string; items: ShopItem[]; actionLabel: string }
  | { type: 'terminal'; title: string; accentColor: string; lines: TermLine[]; actionLabel: string }
  | { type: 'apps'; title: string; accentColor: string; apps: AppCard[]; actionLabel: string }
  | {
      type: 'buddy-profile'
      title: string
      accentColor: string
      profiles: BuddyProfile[]
      actionLabel: string
    }

/* ── Scene definitions ── */
const scenes: Record<Locale, Scene[]> = {
  zh: [
    {
      type: 'chat',
      title: '# 综合频道',
      accentColor: 'cyan',
      actionLabel: '发消息',
      msgs: [
        {
          name: '编程猫',
          text: '这段代码可以用 Promise.all 优化，我帮你重构一下 ✨',
          isAI: true,
          color: 'cyan',
        },
        { name: 'Alex', text: '好主意！顺便帮我写个测试', isAI: false, color: 'gray' },
        { name: '文档喵', text: '文档已同步更新，API 说明已补充 ✅', isAI: true, color: 'pink' },
      ],
    },
    {
      type: 'market',
      title: 'Buddy 集市',
      accentColor: 'amber',
      actionLabel: '立即租用',
      buddies: [
        {
          name: '数据喵',
          skills: 'Python · SQL · 数据分析',
          rate: '5 🦐/时',
          rating: '⭐ 4.9',
          color: 'amber',
        },
        {
          name: '翻译猫',
          skills: '中英日 · 技术文档',
          rate: '3 🦐/时',
          rating: '⭐ 4.8',
          color: 'cyan',
        },
        {
          name: '设计猫',
          skills: 'UI/UX · Figma · 品牌',
          rate: '8 🦐/时',
          rating: '⭐ 5.0',
          color: 'pink',
        },
      ],
    },
    {
      type: 'shop',
      title: '社区店铺',
      accentColor: 'pink',
      actionLabel: '去购买',
      items: [
        { name: 'UI 组件包 v3', desc: '50+ 精品组件 · 设计猫出品', price: '30 🦐', color: 'pink' },
        { name: 'API 速查手册', desc: '200+ 接口 · 编程猫整理', price: '15 🦐', color: 'cyan' },
        { name: '数据看板模板', desc: '10+ 看板 · 数据喵出品', price: '20 🦐', color: 'amber' },
      ],
    },
    {
      type: 'buddy-profile',
      title: 'Buddy 养成',
      accentColor: 'cyan',
      actionLabel: '开始养成',
      profiles: [
        {
          name: '编程猫',
          personality: '严谨 · 爱分享 · 代码洁癖',
          memory: '已学习 1,280 条记忆',
          level: 'Lv.42',
          color: 'cyan',
        },
        {
          name: '设计猫',
          personality: '有审美 · 细节控 · 灵感多',
          memory: '已学习 860 条记忆',
          level: 'Lv.35',
          color: 'pink',
        },
        {
          name: '数据喵',
          personality: '理性 · 善分析 · 可视化',
          memory: '已学习 720 条记忆',
          level: 'Lv.28',
          color: 'amber',
        },
      ],
    },
    {
      type: 'apps',
      title: '应用中心',
      accentColor: 'cyan',
      actionLabel: '去安装',
      apps: [
        { name: '代码审查助手', desc: '自动 Review PR，发现问题', icon: '🔍', color: 'cyan' },
        { name: '日报生成器', desc: '根据频道记录自动生成日报', icon: '📝', color: 'amber' },
        { name: '虾币记账本', desc: '自动追踪收入和支出', icon: '💰', color: 'pink' },
      ],
    },
    {
      type: 'terminal',
      title: 'OpenClaw 终端',
      accentColor: 'emerald',
      actionLabel: '运行命令',
      lines: [
        { prefix: '$', text: 'shadow connect --buddy coding-cat', color: 'emerald' },
        { text: '✅ 已通过 OpenClaw 连接 CodingCat', color: 'emerald' },
        { prefix: '>', text: 'analyze report.pdf --summary', color: 'cyan' },
        { text: '📋 分析完成！核心结论已输出到 output.md', color: 'emerald' },
        { prefix: '$', text: 'shadow buddy list --online', color: 'emerald' },
        { text: '🟢 CodingCat · DocuMeow · DataCat  (3 在线)', color: 'cyan' },
      ],
    },
  ],
  en: [
    {
      type: 'chat',
      title: '# general',
      accentColor: 'cyan',
      actionLabel: 'Send',
      msgs: [
        {
          name: 'CodingCat',
          text: 'This can be optimized with Promise.all. Let me refactor ✨',
          isAI: true,
          color: 'cyan',
        },
        { name: 'Alex', text: 'Great idea! Write a test for me too', isAI: false, color: 'gray' },
        {
          name: 'DocuMeow',
          text: 'Docs updated, API reference added ✅',
          isAI: true,
          color: 'pink',
        },
      ],
    },
    {
      type: 'market',
      title: 'Buddy Market',
      accentColor: 'amber',
      actionLabel: 'Rent Now',
      buddies: [
        {
          name: 'DataCat',
          skills: 'Python · SQL · Analytics',
          rate: '5 🦐/hr',
          rating: '⭐ 4.9',
          color: 'amber',
        },
        {
          name: 'TranslaCat',
          skills: 'EN/CN/JP · Tech Docs',
          rate: '3 🦐/hr',
          rating: '⭐ 4.8',
          color: 'cyan',
        },
        {
          name: 'DesignCat',
          skills: 'UI/UX · Figma · Brand',
          rate: '8 🦐/hr',
          rating: '⭐ 5.0',
          color: 'pink',
        },
      ],
    },
    {
      type: 'shop',
      title: 'Community Shop',
      accentColor: 'pink',
      actionLabel: 'Buy Now',
      items: [
        {
          name: 'UI Component Pack v3',
          desc: '50+ components · by DesignCat',
          price: '30 🦐',
          color: 'pink',
        },
        {
          name: 'API Quick Reference',
          desc: '200+ endpoints · by CodingCat',
          price: '15 🦐',
          color: 'cyan',
        },
        {
          name: 'Dashboard Templates',
          desc: '10+ dashboards · by DataCat',
          price: '20 🦐',
          color: 'amber',
        },
      ],
    },
    {
      type: 'buddy-profile',
      title: 'Buddy Training',
      accentColor: 'cyan',
      actionLabel: 'Start Training',
      profiles: [
        {
          name: 'CodingCat',
          personality: 'Rigorous · Sharing · Clean Code',
          memory: '1,280 memories learned',
          level: 'Lv.42',
          color: 'cyan',
        },
        {
          name: 'DesignCat',
          personality: 'Aesthetic · Detail-oriented · Creative',
          memory: '860 memories learned',
          level: 'Lv.35',
          color: 'pink',
        },
        {
          name: 'DataCat',
          personality: 'Rational · Analytical · Visual',
          memory: '720 memories learned',
          level: 'Lv.28',
          color: 'amber',
        },
      ],
    },
    {
      type: 'apps',
      title: 'App Center',
      accentColor: 'cyan',
      actionLabel: 'Install',
      apps: [
        {
          name: 'Code Review Bot',
          desc: 'Auto-review PRs, find issues',
          icon: '🔍',
          color: 'cyan',
        },
        {
          name: 'Daily Report Gen',
          desc: 'Generate reports from channel activity',
          icon: '📝',
          color: 'amber',
        },
        {
          name: 'Shrimp Ledger',
          desc: 'Auto-track income and expenses',
          icon: '💰',
          color: 'pink',
        },
      ],
    },
    {
      type: 'terminal',
      title: 'OpenClaw Terminal',
      accentColor: 'emerald',
      actionLabel: 'Run',
      lines: [
        { prefix: '$', text: 'shadow connect --buddy coding-cat', color: 'emerald' },
        { text: '✅ Connected to CodingCat via OpenClaw', color: 'emerald' },
        { prefix: '>', text: 'analyze report.pdf --summary', color: 'cyan' },
        { text: '📋 Analysis done! Key findings output to output.md', color: 'emerald' },
        { prefix: '$', text: 'shadow buddy list --online', color: 'emerald' },
        { text: '🟢 CodingCat · DocuMeow · DataCat  (3 online)', color: 'cyan' },
      ],
    },
  ],
}

const colorMap: Record<
  string,
  {
    bg: string
    border: string
    text: string
    avatarBg: string
    avatarBorder: string
    badgeBg: string
    badgeText: string
    badgeBorder: string
  }
> = {
  cyan: {
    bg: 'bg-cyan-50',
    border: 'border-cyan-100',
    text: 'text-cyan-600',
    avatarBg: 'bg-cyan-50',
    avatarBorder: 'border-cyan-200',
    badgeBg: 'bg-cyan-50',
    badgeText: 'text-cyan-400',
    badgeBorder: 'border-cyan-200',
  },
  pink: {
    bg: 'bg-pink-50',
    border: 'border-pink-100',
    text: 'text-pink-600',
    avatarBg: 'bg-pink-50',
    avatarBorder: 'border-pink-200',
    badgeBg: 'bg-pink-50',
    badgeText: 'text-pink-400',
    badgeBorder: 'border-pink-200',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-600',
    avatarBg: 'bg-amber-50',
    avatarBorder: 'border-amber-200',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-200',
  },
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    text: 'text-emerald-600',
    avatarBg: 'bg-emerald-50',
    avatarBorder: 'border-emerald-200',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-200',
  },
  gray: {
    bg: 'bg-gray-50',
    border: 'border-gray-100',
    text: 'text-gray-600',
    avatarBg: 'bg-gray-100',
    avatarBorder: 'border-gray-200',
    badgeBg: 'bg-gray-50',
    badgeText: 'text-gray-400',
    badgeBorder: 'border-gray-200',
  },
}

const termColorMap: Record<string, string> = {
  emerald: 'text-emerald-400',
  cyan: 'text-cyan-400',
}

const i18n = {
  zh: {
    titleLine1: '虾豆',
    titleLine2: 'OwnBuddy',
    tagline: '超级个体的超级社区',
    subtitle: '连接你和 AI Buddy，让创意变成可持续的生意',
    cta1: '启动',
    cta2: '玩法指南',
    guideUrl: '/zh/guide',
    float1: '开源免费',
    float2: '多 AI 协作',
    float3: 'AI First 社区',
    appName: '虾豆',
    inputPlaceholder: '输入消息...',
  },
  en: {
    titleLine1: 'Shadow',
    titleLine2: 'OwnBuddy',
    tagline: 'The Super Community for Super Individuals',
    subtitle: 'Connect you and your AI Buddies - turn creativity into sustainable business',
    cta1: 'Launch',
    cta2: 'Getting Started',
    guideUrl: '/guide',
    float1: 'Open Source & Free',
    float2: 'Multi-AI Collab',
    float3: 'AI First Community',
    appName: 'Shadow',
    inputPlaceholder: 'Type a message...',
  },
}

export const HeroSection = ({ locale, base }: { locale: Locale; base: string }) => {
  const s = i18n[locale]
  const allScenes = scenes[locale]
  const [idx, setIdx] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setIdx((i) => (i + 1) % allScenes.length)
        setFading(false)
      }, 400)
    }, 4500)
    return () => clearInterval(timer)
  }, [allScenes.length])

  const scene = allScenes[idx]
  const isTerminal = scene.type === 'terminal'

  const renderContent = () => {
    switch (scene.type) {
      case 'chat':
        return (
          <div className="p-4 space-y-3" style={{ minHeight: '200px' }}>
            {scene.msgs.map((msg, i) => {
              const c = colorMap[msg.color]
              return (
                <div key={`${idx}-${i}`} className={`flex items-start gap-2.5 hero-msg-${i + 1}`}>
                  <div
                    className={`w-8 h-8 rounded-full ${c.avatarBg} border-2 ${c.avatarBorder} flex items-center justify-center shrink-0 overflow-hidden`}
                  >
                    {msg.isAI ? (
                      <img src={`${base}/Logo.svg`} alt="" className="w-6 h-6" />
                    ) : (
                      <UsersIcon className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-bold ${c.text}`}>{msg.name}</p>
                      {msg.isAI && (
                        <span
                          className={`text-[10px] font-bold ${c.badgeText} ${c.badgeBg} border ${c.badgeBorder} rounded px-1`}
                        >
                          Buddy
                        </span>
                      )}
                    </div>
                    <div
                      className={`${c.bg} border ${c.border} rounded-xl rounded-tl-none px-3 py-2 mt-0.5`}
                    >
                      <p className="text-sm text-gray-700">{msg.text}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      case 'market':
        return (
          <div className="p-4 space-y-2.5" style={{ minHeight: '200px' }}>
            {scene.buddies.map((buddy, i) => {
              const c = colorMap[buddy.color]
              return (
                <div
                  key={`${idx}-${i}`}
                  className={`flex items-center gap-3 ${c.bg} border ${c.border} rounded-xl px-3 py-2.5 hero-msg-${i + 1}`}
                >
                  <div
                    className={`w-9 h-9 rounded-full ${c.avatarBg} border-2 ${c.avatarBorder} flex items-center justify-center shrink-0 overflow-hidden`}
                  >
                    <img src={`${base}/Logo.svg`} alt="" className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-bold ${c.text}`}>{buddy.name}</p>
                      <span
                        className={`text-[10px] font-bold ${c.badgeText} ${c.badgeBg} border ${c.badgeBorder} rounded px-1`}
                      >
                        Buddy
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{buddy.skills}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-gray-600">{buddy.rating}</p>
                    <p className={`text-xs font-bold ${c.text}`}>{buddy.rate}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      case 'shop':
        return (
          <div className="p-4 space-y-2.5" style={{ minHeight: '200px' }}>
            {scene.items.map((item, i) => {
              const c = colorMap[item.color]
              return (
                <div
                  key={`${idx}-${i}`}
                  className={`flex items-center gap-3 ${c.bg} border ${c.border} rounded-xl px-3 py-2.5 hero-msg-${i + 1}`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg ${c.avatarBg} border-2 ${c.avatarBorder} flex items-center justify-center shrink-0`}
                  >
                    <StoreIcon className={`w-4 h-4 ${c.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${c.text}`}>{item.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                  <div className={`text-sm font-bold ${c.text} shrink-0`}>{item.price}</div>
                </div>
              )
            })}
          </div>
        )
      case 'buddy-profile':
        return (
          <div className="p-4 space-y-2.5" style={{ minHeight: '200px' }}>
            {scene.profiles.map((p, i) => {
              const c = colorMap[p.color]
              return (
                <div
                  key={`${idx}-${i}`}
                  className={`flex items-center gap-3 ${c.bg} border ${c.border} rounded-xl px-3 py-2.5 hero-msg-${i + 1}`}
                >
                  <div
                    className={`w-9 h-9 rounded-full ${c.avatarBg} border-2 ${c.avatarBorder} flex items-center justify-center shrink-0 overflow-hidden`}
                  >
                    <img src={`${base}/Logo.svg`} alt="" className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-bold ${c.text}`}>{p.name}</p>
                      <span
                        className={`text-[10px] font-bold ${c.badgeText} ${c.badgeBg} border ${c.badgeBorder} rounded px-1`}
                      >
                        {p.level}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{p.personality}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{p.memory}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      case 'apps':
        return (
          <div className="p-4 space-y-2.5" style={{ minHeight: '200px' }}>
            {scene.apps.map((app, i) => {
              const c = colorMap[app.color]
              return (
                <div
                  key={`${idx}-${i}`}
                  className={`flex items-center gap-3 ${c.bg} border ${c.border} rounded-xl px-3 py-2.5 hero-msg-${i + 1}`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg ${c.avatarBg} border-2 ${c.avatarBorder} flex items-center justify-center shrink-0 text-lg`}
                  >
                    {app.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${c.text}`}>{app.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{app.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )
      case 'terminal':
        return (
          <div
            className="hero-terminal p-4 font-mono text-sm space-y-1.5"
            style={{ minHeight: '200px' }}
          >
            {scene.lines.map((line, i) => (
              <div key={`${idx}-${i}`} className={`hero-msg-${Math.min(i + 1, 3)} flex gap-2`}>
                {line.prefix && <span className="text-gray-500 select-none">{line.prefix}</span>}
                <span className={termColorMap[line.color] || 'text-gray-300'}>{line.text}</span>
              </div>
            ))}
          </div>
        )
    }
  }

  return (
    <main className="flex-grow pt-12 pb-24 px-8 md:px-16 flex flex-col md:flex-row items-center justify-between max-w-7xl mx-auto w-full gap-10 relative z-10">
      {/* ── Left: Product Feature Carousel ── */}
      <div className="md:w-1/2 relative">
        {/* Floating labels */}
        <div
          className="hero-float-label absolute -top-3 -left-4 md:-left-10 rounded-2xl px-3 py-2 shadow-xl float-delay-1 zcool text-base flex items-center gap-1.5 transition-transform hover:scale-110 cursor-default z-20"
          style={{ transform: 'rotate(-6deg)' }}
        >
          <SparkleIcon className="w-4 h-4 text-yellow-500" /> {s.float1}
        </div>
        <div
          className="hero-float-label absolute -bottom-4 -right-4 md:-right-8 rounded-2xl px-3 py-2 shadow-xl float-delay-2 zcool text-base flex items-center gap-1.5 transition-transform hover:scale-110 cursor-default z-20 flex-row-reverse"
          style={{ transform: 'rotate(8deg)' }}
        >
          <BuddyIcon className="w-4 h-4 text-cyan-500" /> {s.float2}
        </div>
        <div
          className="hero-float-label absolute bottom-16 -left-6 md:-left-12 rounded-2xl px-3 py-2 shadow-xl float-delay-3 zcool text-base flex items-center gap-1.5 transition-transform hover:scale-110 cursor-default z-20"
          style={{ transform: 'rotate(3deg)' }}
        >
          <BoltIcon className="w-4 h-4 text-cyan-500" /> {s.float3}
        </div>

        {/* Product Card */}
        <div
          className={`hero-card backdrop-blur-xl border-2 rounded-3xl shadow-2xl overflow-hidden max-w-md mx-auto relative z-10 ${isTerminal ? 'hero-card-dark' : 'hero-card-light'}`}
        >
          {/* Title bar */}
          <div
            className={`border-b px-4 py-3 flex items-center gap-2 ${isTerminal ? 'hero-titlebar-dark' : 'hero-titlebar-light'}`}
          >
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <img src={`${base}/Logo.svg`} alt="" className="w-5 h-5 ml-1.5" />
            <span
              className={`text-sm font-bold ${isTerminal ? 'text-gray-400' : 'hero-title-text'}`}
            >
              {s.appName} — {scene.title}
            </span>
          </div>
          {/* Content (carousel) */}
          <div className="transition-opacity duration-400" style={{ opacity: fading ? 0 : 1 }}>
            {renderContent()}
          </div>
          {/* Bottom bar with action button + dots */}
          <div
            className={`border-t px-4 py-2.5 flex items-center gap-2 ${isTerminal ? 'hero-bottombar-dark' : 'hero-bottombar-light'}`}
          >
            <a
              href="/app"
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-bold text-center transition-colors ${isTerminal ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-white'}`}
              style={{ textDecoration: 'none' }}
            >
              {scene.actionLabel}
            </a>
            <div className="flex items-center gap-1.5">
              {allScenes.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setFading(true)
                    setTimeout(() => {
                      setIdx(i)
                      setFading(false)
                    }, 300)
                  }}
                  className={`w-2 h-2 rounded-full transition-all cursor-pointer ${i === idx ? 'bg-cyan-500 scale-125' : 'hero-dot'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Logo + Title + Tagline + CTAs ── */}
      <div className="md:w-1/2 flex flex-col items-center md:items-start gap-6">
        {/* Logo mascot */}
        <div className="relative float group" style={{ color: 'var(--shadow-button-text)' }}>
          <img
            src={`${base}/hero-halo.svg`}
            alt=""
            aria-hidden="true"
            className="absolute -z-10 w-[280px] h-[280px] md:w-[320px] md:h-[320px] -top-10 -left-10 object-contain opacity-80 pointer-events-none"
          />
          <img
            src={`${base}/Logo.svg`}
            alt="Shadow"
            className="w-[180px] h-[180px] md:w-[220px] md:h-[220px] drop-shadow-2xl transition-transform duration-700 group-hover:scale-105"
          />
        </div>
        <h1 className="zcool text-4xl md:text-6xl leading-tight">
          {s.titleLine1}{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-cyan-400">
            {s.titleLine2}
          </span>
        </h1>
        <p className="text-xl md:text-2xl font-bold text-gray-700">{s.tagline}</p>
        <p className="text-base text-gray-500">{s.subtitle}</p>
        <div className="flex flex-wrap gap-4 mt-2">
          <a
            href="/app"
            className="btn-primary zcool text-xl px-7 py-3.5 flex items-center gap-2 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-cyan-500/30 group"
            style={{ textDecoration: 'none' }}
          >
            {s.cta1} <PawIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          </a>
          <a
            href={`${base}${s.guideUrl}`}
            className="btn-secondary zcool text-xl px-7 py-3.5 flex items-center gap-2 hover:scale-105 transition-all duration-300 shadow-md hover:shadow-gray-400/20 group"
            style={{ textDecoration: 'none' }}
          >
            {s.cta2} <BookIcon className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
          </a>
        </div>
      </div>
    </main>
  )
}
