/**
 * SkillHub Browser & Manager
 *
 * Browse, search, install, and manage OpenClaw skills from ClawHub
 * and SkillHub registries. Features skill configuration, enable/disable
 * toggles, per-skill API key management, and a leaderboard tab.
 */

import {
  Award,
  Bot,
  Brain,
  Check,
  Code2,
  Download,
  Eye,
  GraduationCap,
  Heart,
  Loader2,
  Package,
  Palette,
  PenTool,
  Search,
  Settings2,
  Star,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  SkillHubEntry,
  SkillHubRegistry,
  SkillHubSearchResult,
  SkillManifest,
} from '../../lib/openclaw-api'
import { openClawApi } from '../../lib/openclaw-api'
import { OpenClawTopBar } from './openclaw-brand'

type TabView = 'installed' | 'browse' | 'leaderboard'

// ─── Category Definitions ─────────────────────────────────────────────────

const SKILL_CATEGORIES = [
  {
    id: 'ai',
    label: 'AI 智能',
    aliases: ['ai', '智能', '人工智能', 'machine-learning', 'ml', 'llm'],
    icon: Brain,
    color: 'from-violet-500 to-purple-600',
  },
  {
    id: 'dev',
    label: '开发工具',
    aliases: ['dev', 'development', '开发', '工具', 'developer', 'coding', 'code'],
    icon: Code2,
    color: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'productivity',
    label: '效率提升',
    aliases: ['productivity', '效率', '提升', 'workflow', 'automation', '自动化'],
    icon: Zap,
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'data',
    label: '数据分析',
    aliases: ['data', '数据', '分析', 'analytics', 'database', 'visualization'],
    icon: TrendingUp,
    color: 'from-emerald-500 to-green-600',
  },
  {
    id: 'design',
    label: '设计创意',
    aliases: ['design', '设计', '创意', 'creative', 'ui', 'ux', 'graphic'],
    icon: Palette,
    color: 'from-pink-500 to-rose-600',
  },
  {
    id: 'content',
    label: '内容创作',
    aliases: ['content', '内容', '创作', 'writing', 'copywriting', 'blog', '写作'],
    icon: PenTool,
    color: 'from-sky-500 to-blue-600',
  },
  {
    id: 'learning',
    label: '学习教育',
    aliases: ['learning', '学习', '教育', 'education', 'tutorial', 'training'],
    icon: GraduationCap,
    color: 'from-indigo-500 to-violet-600',
  },
  {
    id: 'life',
    label: '生活助手',
    aliases: ['life', '生活', '助手', 'lifestyle', 'health', 'utility'],
    icon: Heart,
    color: 'from-rose-500 to-pink-600',
  },
] as const

type CategoryId = (typeof SKILL_CATEGORIES)[number]['id']

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toLocaleString()
}

export function SkillHubPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabView>('browse')
  const [installedSkills, setInstalledSkills] = useState<SkillManifest[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SkillHubSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedRegistry, setSelectedRegistry] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null)
  const [registries, setRegistries] = useState<SkillHubRegistry[]>([])
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [configSkill, setConfigSkill] = useState<SkillManifest | null>(null)
  const [readmeSkill, setReadmeSkill] = useState<{ name: string; content: string } | null>(null)
  const [leaderboard, setLeaderboard] = useState<SkillHubEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, message })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const loadInstalledSkills = useCallback(async () => {
    try {
      const skills = await openClawApi.listSkills()
      setInstalledSkills(skills)
    } catch {
      // Ignore
    }
  }, [])

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true)
    try {
      const skills = await openClawApi.getSkillLeaderboard(50)
      setLeaderboard(skills)
    } catch {
      // Ignore
    } finally {
      setLeaderboardLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!openClawApi.isAvailable) return
    loadInstalledSkills()
    openClawApi
      .getRegistries()
      .then(setRegistries)
      .catch(() => {})
  }, [loadInstalledSkills])

  const handleSearch = useCallback(async () => {
    setSearching(true)
    searchSeqRef.current += 1
    const seq = searchSeqRef.current
    try {
      const categoryDef = selectedCategory
        ? SKILL_CATEGORIES.find((c) => c.id === selectedCategory)
        : null
      const results = await openClawApi.searchSkills(searchQuery || '', {
        registryId: selectedRegistry === 'all' ? undefined : selectedRegistry,
        tags: categoryDef ? [...categoryDef.aliases] : undefined,
      })
      if (seq === searchSeqRef.current) setSearchResults(results)
    } finally {
      if (seq === searchSeqRef.current) setSearching(false)
    }
  }, [searchQuery, selectedRegistry, selectedCategory])

  // Debounced search: triggers 400ms after the user stops typing
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchSeqRef = useRef(0)
  const isComposingRef = useRef(false)

  const triggerDebouncedSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!isComposingRef.current) handleSearch()
    }, 400)
  }, [handleSearch])

  useEffect(() => {
    if (tab === 'browse') handleSearch()
    if (tab === 'leaderboard') loadLeaderboard()
  }, [tab, handleSearch, loadLeaderboard])

  const handleInstall = useCallback(
    async (slug: string) => {
      setInstalling((prev: Set<string>) => new Set(prev).add(slug))
      try {
        const result = await openClawApi.installSkill(
          slug,
          selectedRegistry === 'all' ? undefined : selectedRegistry,
        )
        if (result.success) {
          showToast(
            'success',
            t('openclaw.skillhub.installSuccess', '技能 {{name}} 安装成功', { name: slug }),
          )
          await loadInstalledSkills()
          setSearchResults((prev: SkillHubSearchResult | null) => {
            if (!prev) return prev
            return {
              ...prev,
              skills: prev.skills.map((s: SkillHubEntry) =>
                s.slug === slug ? { ...s, installed: true } : s,
              ),
            }
          })
          setLeaderboard((prev) =>
            prev.map((s) => (s.slug === slug ? { ...s, installed: true } : s)),
          )
        } else {
          showToast('error', result.error || t('openclaw.skillhub.installFailed', '安装失败'))
        }
      } catch (err) {
        showToast(
          'error',
          err instanceof Error ? err.message : t('openclaw.skillhub.installFailed', '安装失败'),
        )
      } finally {
        setInstalling((prev: Set<string>) => {
          const next = new Set(prev)
          next.delete(slug)
          return next
        })
      }
    },
    [selectedRegistry, loadInstalledSkills, showToast, t],
  )

  const handleUninstall = useCallback(
    async (slug: string) => {
      try {
        const result = await openClawApi.uninstallSkill(slug)
        if (result.success) {
          showToast(
            'success',
            t('openclaw.skillhub.uninstallSuccess', '技能 {{name}} 已卸载', { name: slug }),
          )
          await loadInstalledSkills()
          setSearchResults((prev: SkillHubSearchResult | null) => {
            if (!prev) return prev
            return {
              ...prev,
              skills: prev.skills.map((s: SkillHubEntry) =>
                s.slug === slug ? { ...s, installed: false } : s,
              ),
            }
          })
          setLeaderboard((prev) =>
            prev.map((s) => (s.slug === slug ? { ...s, installed: false } : s)),
          )
        } else {
          showToast('error', result.error || t('openclaw.skillhub.uninstallFailed', '卸载失败'))
        }
      } catch (err) {
        showToast(
          'error',
          err instanceof Error ? err.message : t('openclaw.skillhub.uninstallFailed', '卸载失败'),
        )
      }
    },
    [loadInstalledSkills, showToast, t],
  )

  const handleToggleSkill = useCallback(
    async (skillName: string, enabled: boolean) => {
      try {
        await openClawApi.updateSkillConfig(skillName, { enabled })
        await loadInstalledSkills()
      } catch {
        // Ignore
      }
    },
    [loadInstalledSkills],
  )

  const handleViewReadme = useCallback(async (slug: string) => {
    try {
      const content = await openClawApi.getSkillReadme(slug)
      if (content) {
        setReadmeSkill({ name: slug, content })
      }
    } catch {
      // Ignore
    }
  }, [])

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <OpenClawTopBar
        title={t('openclaw.skillhub.title', '技能商店')}
        subtitle={t('openclaw.skillhub.subtitle', '探索、安装和管理 AI 技能')}
      />

      {/* Tabs */}
      <div className="px-6 pb-4">
        <div className="flex gap-1 mt-4 bg-bg-tertiary/50 rounded-lg p-1">
          {[
            {
              key: 'browse' as const,
              icon: Search,
              label: t('openclaw.skillhub.browse', '浏览商店'),
            },
            {
              key: 'leaderboard' as const,
              icon: Award,
              label: t('openclaw.skillhub.leaderboard', '技能榜单'),
            },
            {
              key: 'installed' as const,
              icon: Package,
              label: t('openclaw.skillhub.installed', '已安装'),
              count: installedSkills.length,
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex-1 px-4 py-2.5 rounded-[14px] text-sm font-bold transition-all duration-300 ${
                tab === item.key
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <item.icon size={16} className="inline mr-2 -mt-0.5" />
              {item.label}
              {'count' in item && item.count !== undefined && (
                <span className="opacity-70 ml-1">({item.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
        {tab === 'installed' ? (
          <InstalledSkillsList
            skills={installedSkills}
            onToggle={handleToggleSkill}
            onConfigure={setConfigSkill}
            onUninstall={handleUninstall}
            onViewReadme={handleViewReadme}
          />
        ) : tab === 'browse' ? (
          <SkillBrowser
            query={searchQuery}
            onQueryChange={(q) => {
              setSearchQuery(q)
              triggerDebouncedSearch()
            }}
            onSearch={handleSearch}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              triggerDebouncedSearch()
            }}
            results={searchResults}
            searching={searching}
            registries={registries}
            selectedRegistry={selectedRegistry}
            onRegistryChange={(id) => {
              setSelectedRegistry(id)
              triggerDebouncedSearch()
            }}
            selectedCategory={selectedCategory}
            onCategoryChange={(id) => {
              setSelectedCategory(id)
              triggerDebouncedSearch()
            }}
            installing={installing}
            onInstall={handleInstall}
            onViewReadme={(slug) => {
              const skill = searchResults?.skills.find((s: SkillHubEntry) => s.slug === slug)
              if (skill) {
                setReadmeSkill({
                  name: skill.displayName,
                  content: `# ${skill.displayName}\n\n${skill.description}\n\n**Author:** ${skill.author}\n**Version:** ${skill.version}`,
                })
              }
            }}
          />
        ) : (
          <LeaderboardView
            skills={leaderboard}
            loading={leaderboardLoading}
            installing={installing}
            onInstall={handleInstall}
          />
        )}
      </div>

      {/* Skill Config Modal */}
      {configSkill && (
        <SkillConfigModal
          skill={configSkill}
          onClose={() => setConfigSkill(null)}
          onSave={async (updates) => {
            await openClawApi.updateSkillConfig(configSkill.name, updates)
            await loadInstalledSkills()
            setConfigSkill(null)
          }}
        />
      )}

      {/* Readme Modal */}
      {readmeSkill && (
        <ReadmeModal
          name={readmeSkill.name}
          content={readmeSkill.content}
          onClose={() => setReadmeSkill(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg border transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === 'success'
              ? 'bg-green-500/15 border-green-500/30 text-green-400'
              : 'bg-red-500/15 border-red-500/30 text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? <Check size={14} /> : <X size={14} />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Installed Skills List ──────────────────────────────────────────────────

function InstalledSkillsList({
  skills,
  onToggle,
  onConfigure,
  onUninstall,
  onViewReadme,
}: {
  skills: SkillManifest[]
  onToggle: (name: string, enabled: boolean) => void
  onConfigure: (skill: SkillManifest) => void
  onUninstall: (slug: string) => void
  onViewReadme: (slug: string) => void
}) {
  const { t } = useTranslation()

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-24 h-24 mb-6 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center shadow-lg">
          <Package size={40} className="text-slate-500" />
        </div>
        <h3 className="text-[16px] font-bold text-slate-200 mb-2">
          {t('openclaw.skillhub.noSkills', '这里空空如也')}
        </h3>
        <p className="text-[13px] text-slate-400 max-w-[240px] leading-relaxed">
          {t('openclaw.skillhub.noSkillsDesc', '快去商店浏览那些有趣又实用的 AI 技能吧！')}
        </p>
      </div>
    )
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}
    >
      {skills.map((skill) => (
        <div
          key={skill.name}
          className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 flex flex-col gap-4 group hover:bg-white/[0.04] transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-start gap-4 z-10">
            <div className="w-12 h-12 rounded-[16px] bg-gradient-to-br from-white/10 to-white/5 border border-white/10 shadow-inner flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Package size={20} className="text-slate-300" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[15px] font-bold text-slate-100 truncate">
                  {skill.displayName}
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/5 text-slate-400 font-mono tracking-widest uppercase">
                  v{skill.version}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tracking-widest uppercase ${
                    skill.source === 'hub'
                      ? 'bg-rose-500/10 text-rose-400'
                      : skill.source === 'preinstalled'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-white/5 text-slate-400'
                  }`}
                >
                  {skill.source}
                </span>
              </div>
              <p className="text-[13px] text-slate-400 line-clamp-2 leading-relaxed h-10">
                {skill.description}
              </p>
            </div>
          </div>

          {/* Footer & Actions */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5 z-10">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onViewReadme(skill.name)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
                title="阅读文档"
              >
                <Eye size={16} />
              </button>
              <button
                type="button"
                onClick={() => onConfigure(skill)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
                title="偏好设置"
              >
                <Settings2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => onUninstall(skill.name)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="卸载该技能"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Toggle */}
            <div
              role="switch"
              aria-checked={skill.enabled}
              tabIndex={0}
              onClick={() => onToggle(skill.name, !skill.enabled)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle(skill.name, !skill.enabled)
                }
              }}
              className={`relative w-12 h-7 rounded-full transition-colors duration-300 ease-in-out cursor-pointer shrink-0 ${
                skill.enabled
                  ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-white/10'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                  skill.enabled ? 'translate-x-5' : ''
                }`}
              />
            </div>
          </div>

          {skill.enabled && (
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-[40px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Category Filter Bar ────────────────────────────────────────────────────

function CategoryBar({
  selected,
  onChange,
}: {
  selected: CategoryId | null
  onChange: (id: CategoryId | null) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {SKILL_CATEGORIES.map((cat) => {
        const Icon = cat.icon
        const active = selected === cat.id
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(active ? null : cat.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-bold whitespace-nowrap transition-all duration-200 shrink-0 ${
              active
                ? 'bg-gradient-to-r text-white shadow-lg scale-[1.02]'
                : 'bg-white/[0.03] border border-white/5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
            } ${active ? cat.color : ''}`}
          >
            <Icon size={16} />
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Skill Browser ──────────────────────────────────────────────────────────

function SkillBrowser({
  query,
  onQueryChange,
  onSearch,
  onCompositionStart,
  onCompositionEnd,
  results,
  searching,
  registries,
  selectedRegistry,
  onRegistryChange,
  selectedCategory,
  onCategoryChange,
  installing,
  onInstall,
  onViewReadme,
}: {
  query: string
  onQueryChange: (q: string) => void
  onSearch: () => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
  results: SkillHubSearchResult | null
  searching: boolean
  registries: SkillHubRegistry[]
  selectedRegistry: string
  onRegistryChange: (id: string) => void
  selectedCategory: CategoryId | null
  onCategoryChange: (id: CategoryId | null) => void
  installing: Set<string>
  onInstall: (slug: string) => void
  onViewReadme: (slug: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-5">
      {/* Category Filter */}
      <CategoryBar selected={selectedCategory} onChange={onCategoryChange} />

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="flex-1 relative group">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-400 transition-colors"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch()
            }}
            placeholder={t('openclaw.skillhub.searchPlaceholder', '输入关键词搜索有趣的技能...')}
            className="w-full pl-12 pr-4 py-3.5 rounded-[16px] bg-white/[0.03] border border-white/10 text-[15px] font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-400/50 focus:bg-white/[0.05] transition-all shadow-sm focus:shadow-rose-500/10"
          />
        </div>

        {/* Registry Filter */}
        <div className="relative shrink-0">
          <select
            value={selectedRegistry}
            onChange={(e) => onRegistryChange(e.target.value)}
            className="h-full px-5 pr-10 rounded-[16px] bg-white/[0.03] border border-white/10 text-[14px] font-bold text-slate-200 focus:outline-none focus:border-rose-400/50 appearance-none cursor-pointer hover:bg-white/[0.05] transition-colors"
          >
            <option value="all">{t('openclaw.skillhub.allRegistries', '所有官方生态')}</option>
            {registries.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M3 4.5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <button
          type="button"
          onClick={onSearch}
          disabled={searching}
          className="px-6 py-3.5 rounded-[16px] bg-gradient-to-r from-rose-500 to-red-500 text-white text-[15px] font-bold hover:shadow-lg hover:shadow-rose-500/30 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center shrink-0"
        >
          {searching ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            t('openclaw.skillhub.search', '发现技能')
          )}
        </button>
      </div>

      {/* Results */}
      {searching ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-rose-500" />
        </div>
      ) : results ? (
        results.skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 mb-6 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center shadow-lg">
              <Search size={40} className="text-slate-500" />
            </div>
            <p className="text-[16px] font-bold text-slate-200 mb-2">
              {t('openclaw.skillhub.noResults', '换个词试试吧')}
            </p>
            <p className="text-[13px] text-slate-400">没有找到相关的技能。</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-slate-500 uppercase tracking-widest">
                {t('openclaw.skillhub.resultsCount', '探索到 {{count}} 个技能', {
                  count: results.total,
                })}
              </p>
            </div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}
            >
              {results.skills.map((skill) => (
                <SkillCard
                  key={skill.slug}
                  skill={skill}
                  installing={installing.has(skill.slug)}
                  onInstall={() => onInstall(skill.slug)}
                  onViewReadme={() => onViewReadme(skill.slug)}
                />
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  )
}

// ─── Skill Card ─────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  installing,
  onInstall,
  onViewReadme,
}: {
  skill: SkillHubEntry
  installing: boolean
  onInstall: () => void
  onViewReadme: () => void
}) {
  const { t } = useTranslation()
  const categoryDef = skill.tags?.length
    ? SKILL_CATEGORIES.find((c) =>
        skill.tags!.some((tag) =>
          c.aliases.some((alias) => tag.toLowerCase().includes(alias.toLowerCase())),
        ),
      )
    : null

  return (
    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-5 flex flex-col gap-4 group hover:bg-white/[0.04] transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 relative overflow-hidden">
      <div className="flex items-start gap-4 z-10">
        <div
          className={`w-12 h-12 rounded-[16px] bg-gradient-to-br ${categoryDef?.color ?? 'from-white/10 to-white/5'} border border-white/10 shadow-inner flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
        >
          {categoryDef ? (
            <categoryDef.icon size={20} className="text-white/90" />
          ) : (
            <Bot size={20} className="text-slate-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[15px] font-bold text-slate-100 truncate">{skill.displayName}</p>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/5 text-slate-400 font-mono tracking-widest uppercase">
              v{skill.version}
            </span>
          </div>
          <p className="text-[13px] text-slate-400 line-clamp-2 leading-relaxed h-10">
            {skill.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-auto pt-4 border-t border-white/5 z-10 justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-bold text-slate-400 max-w-[80px] truncate">
            {skill.author}
          </span>
          {skill.downloads !== undefined && (
            <span className="text-[12px] font-bold text-slate-400 flex items-center bg-white/5 px-2 py-0.5 rounded-full">
              <Download size={12} className="inline mr-1 text-slate-500" />
              {formatNumber(skill.downloads)}
            </span>
          )}
          {skill.rating !== undefined && (
            <span className="text-[12px] font-bold text-amber-400 flex items-center bg-amber-500/10 px-2 py-0.5 rounded-full">
              <Star size={12} className="inline mr-1 fill-current" />
              {skill.rating}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onViewReadme}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
            title="查看详情"
          >
            <Eye size={16} />
          </button>
          {skill.installed ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-[13px] font-bold ring-1 ring-emerald-500/20">
              <Check size={14} />
              {t('openclaw.skillhub.installed2', '已安装')}
            </span>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              disabled={installing}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white/10 text-white text-[13px] font-bold hover:bg-white/20 disabled:opacity-50 transition-colors active:scale-95"
            >
              {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {t('openclaw.skillhub.install', '安装')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Leaderboard View ───────────────────────────────────────────────────────

function LeaderboardView({
  skills,
  loading,
  installing,
  onInstall,
}: {
  skills: SkillHubEntry[]
  loading: boolean
  installing: Set<string>
  onInstall: (slug: string) => void
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-rose-500" />
      </div>
    )
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-24 h-24 mb-6 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center shadow-lg">
          <Award size={40} className="text-slate-500" />
        </div>
        <h3 className="text-[16px] font-bold text-slate-200 mb-2">
          {t('openclaw.skillhub.noLeaderboard', '暂无榜单数据')}
        </h3>
        <p className="text-[13px] text-slate-400 max-w-[240px] leading-relaxed">稍后再来看看吧</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
          <Award size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-[18px] font-black text-white">
            精选 TOP {skills.length} AI Skills 榜单
          </h2>
          <p className="text-[13px] text-slate-400">
            {t('openclaw.skillhub.leaderboardDesc', '最受欢迎的 AI 技能排行')}
          </p>
        </div>
      </div>

      {/* Leaderboard List */}
      <div className="space-y-2">
        {skills.map((skill, index) => {
          const rank = index + 1
          const isTop3 = rank <= 3
          const categoryDef = skill.tags?.length
            ? SKILL_CATEGORIES.find((c) =>
                skill.tags!.some((tag) =>
                  c.aliases.some((alias) => tag.toLowerCase().includes(alias.toLowerCase())),
                ),
              )
            : null

          return (
            <div
              key={skill.slug}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg group ${
                isTop3
                  ? 'bg-gradient-to-r from-white/[0.04] to-transparent border-amber-500/20 hover:border-amber-500/40'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
              }`}
            >
              {/* Rank */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[14px] font-black ${
                  rank === 1
                    ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30'
                    : rank === 2
                      ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-lg shadow-slate-400/20'
                      : rank === 3
                        ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/20'
                        : 'bg-white/5 text-slate-400'
                }`}
              >
                {rank}
              </div>

              {/* Icon */}
              <div
                className={`w-10 h-10 rounded-[14px] bg-gradient-to-br ${categoryDef?.color ?? 'from-white/10 to-white/5'} border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
              >
                {categoryDef ? (
                  <categoryDef.icon size={18} className="text-white/90" />
                ) : (
                  <Bot size={18} className="text-slate-300" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-bold text-slate-100 truncate">
                    {skill.displayName}
                  </p>
                  {categoryDef && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${categoryDef.color} text-white/90 whitespace-nowrap`}
                    >
                      {categoryDef.label}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-slate-400 truncate mt-0.5">{skill.description}</p>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3 shrink-0">
                {skill.downloads !== undefined && (
                  <span className="text-[12px] font-bold text-slate-400 flex items-center gap-1">
                    <Download size={13} className="text-slate-500" />
                    {formatNumber(skill.downloads)}
                  </span>
                )}
                {skill.rating !== undefined && (
                  <span className="text-[12px] font-bold text-amber-400 flex items-center gap-1">
                    <Star size={13} className="fill-current" />
                    {skill.rating}
                  </span>
                )}
              </div>

              {/* Install Button */}
              <div className="shrink-0">
                {skill.installed ? (
                  <span className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-[12px] font-bold ring-1 ring-emerald-500/20">
                    <Check size={13} />
                    已安装
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onInstall(skill.slug)}
                    disabled={installing.has(skill.slug)}
                    className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 disabled:opacity-50 transition-colors active:scale-95"
                  >
                    {installing.has(skill.slug) ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Download size={13} />
                    )}
                    安装
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Skill Config Modal ─────────────────────────────────────────────────────

function SkillConfigModal({
  skill,
  onClose,
  onSave,
}: {
  skill: SkillManifest
  onClose: () => void
  onSave: (updates: {
    enabled?: boolean
    apiKey?: string
    env?: Record<string, string>
  }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [apiKey, setApiKey] = useState(skill.apiKey ?? '')
  const [envEntries, setEnvEntries] = useState<Array<{ key: string; value: string }>>(
    skill.env ? Object.entries(skill.env).map(([key, value]) => ({ key, value })) : [],
  )
  const [saving, setSaving] = useState(false)

  const handleAddEnv = () => {
    setEnvEntries([...envEntries, { key: '', value: '' }])
  }

  const handleRemoveEnv = (idx: number) => {
    setEnvEntries(envEntries.filter((_: { key: string; value: string }, i: number) => i !== idx))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const env: Record<string, string> = {}
      for (const entry of envEntries) {
        if (entry.key.trim()) {
          env[entry.key.trim()] = entry.value
        }
      }
      await onSave({
        apiKey: apiKey || undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-[#1a1b23] rounded-[32px] border border-white/10 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
              <Package size={20} className="text-rose-400" />
            </div>
            <h3 className="text-[18px] font-black text-white">{skill.displayName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* API Key */}
          <div>
            <label className="block text-[14px] font-bold text-slate-200 mb-2">
              {t('openclaw.skillhub.apiKey', 'API 密钥')}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t(
                'openclaw.skillhub.apiKeyPlaceholder',
                '输入该技能需要的专属 API 密钥 (选填)',
              )}
              className="w-full px-5 py-3.5 rounded-[16px] bg-white/[0.03] border border-white/10 text-[14px] text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-400/50 focus:bg-white/[0.05] transition-all"
            />
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[14px] font-bold text-slate-200">
                {t('openclaw.skillhub.envVars', '环境变量')}
              </label>
              <button
                type="button"
                onClick={handleAddEnv}
                className="text-[13px] font-bold text-rose-400 hover:text-rose-300 transition-colors bg-rose-500/10 px-3 py-1.5 rounded-lg"
              >
                + {t('openclaw.skillhub.addVar', '添加变量')}
              </button>
            </div>
            {envEntries.length === 0 ? (
              <div className="p-6 rounded-[16px] bg-white/[0.02] border border-white/5 border-dashed text-center">
                <p className="text-[13px] text-slate-400 font-medium">
                  {t('openclaw.skillhub.noEnvVars', '无需复杂的配置，开箱即用')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {envEntries.map((entry: { key: string; value: string }, idx: number) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={entry.key}
                      onChange={(e) => {
                        const next = [...envEntries]
                        next[idx] = { ...next[idx]!, key: e.target.value }
                        setEnvEntries(next)
                      }}
                      placeholder="KEY"
                      className="flex-1 px-4 py-3 rounded-[12px] bg-white/[0.03] border border-white/10 text-[13px] font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-400/50 transition-all uppercase"
                    />
                    <div className="text-slate-500 font-bold">=</div>
                    <input
                      type="text"
                      value={entry.value}
                      onChange={(e) => {
                        const next = [...envEntries]
                        next[idx] = { ...next[idx]!, value: e.target.value }
                        setEnvEntries(next)
                      }}
                      placeholder="Value"
                      className="flex-[2] px-4 py-3 rounded-[12px] bg-white/[0.03] border border-white/10 text-[13px] font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-400/50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveEnv(idx)}
                      className="w-10 h-10 rounded-[12px] flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-8 py-6 border-t border-white/5 shrink-0 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-[16px] text-[14px] font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 rounded-[16px] bg-rose-500 text-white text-[14px] font-bold hover:bg-rose-400 hover:shadow-lg hover:shadow-rose-500/20 active:scale-95 disabled:opacity-50 transition-all"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t('common.save', '保存配置')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Readme Modal ───────────────────────────────────────────────────────────

function ReadmeModal({
  name,
  content,
  onClose,
}: {
  name: string
  content: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-[#1a1b23] rounded-[32px] border border-white/10 w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 shrink-0">
          <h3 className="text-[18px] font-black text-white">{name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <pre className="text-[14px] text-slate-300 whitespace-pre-wrap font-sans leading-loose bg-white/[0.02] p-6 rounded-[24px] border border-white/5">
            {content}
          </pre>
        </div>
      </div>
    </div>
  )
}
