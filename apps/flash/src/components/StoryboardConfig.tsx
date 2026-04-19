/**
 * StoryboardConfig — Inline configuration area at top of storyboard
 *
 * Merges theme selection, PPT settings, and deep research settings into the storyboard
 * Presented as collapsible cards, no need for modals or sidebars
 */

import {
  Award,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Grid,
  Heart,
  Loader2,
  Microscope,
  Palette,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { searchThemes as apiSearchThemes } from '../api'
import { getActiveDeck, useApp } from '../store'
import { THEME_PRESETS } from '../themes'
import type { PptSettings, SdkThemeItem, ThemePreset, UserSettings } from '../types'

type ThemeCategory = 'all' | 'cover' | 'report' | 'official' | 'preset'

const CATEGORIES: { id: ThemeCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cover', label: 'Cover Style' },
  { id: 'report', label: 'Work Report' },
  { id: 'official', label: 'Official Templates' },
  { id: 'preset', label: 'Built-in Presets' },
]

export default function StoryboardConfig() {
  const { state, dispatch } = useApp()
  const deck = getActiveDeck(state.project)
  const currentTheme = deck?.theme ?? THEME_PRESETS[0]

  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

  if (!deck) return null

  return (
    <div className="space-y-1.5 mb-4">
      {/* ═══ Theme Selection ═══ */}
      <ConfigSection
        id="theme"
        icon={<Palette className="h-3.5 w-3.5 text-purple-400" />}
        title="Theme Style"
        subtitle={currentTheme.name}
        expanded={expandedSection === 'theme'}
        onToggle={() => toggleSection('theme')}
      >
        <ThemeSelector />
      </ConfigSection>

      {/* ═══ PPT Settings ═══ */}
      <ConfigSection
        id="ppt"
        icon={<Sliders className="h-3.5 w-3.5 text-cyan-400" />}
        title="PPT Settings"
        subtitle={`${state.pptSettings.aspectRatio} · ${state.pptSettings.contentStyle === 'concise' ? 'Concise' : state.pptSettings.contentStyle === 'detailed' ? 'Detailed' : 'Visual'}`}
        expanded={expandedSection === 'ppt'}
        onToggle={() => toggleSection('ppt')}
      >
        <PptSettingsInline
          settings={state.pptSettings}
          onChange={(updates) => dispatch({ type: 'SET_PPT_SETTINGS', settings: updates })}
        />
      </ConfigSection>

      {/* ═══ AI Automation Settings ═══ */}
      <ConfigSection
        id="research"
        icon={<Microscope className="h-3.5 w-3.5 text-emerald-400" />}
        title="AI Automation"
        subtitle={
          [
            state.userSettings.autoInspire && 'Inspire',
            state.userSettings.autoResearch && 'Deep Research',
            state.userSettings.autoConsumeTodos && 'Consume Todos',
          ]
            .filter(Boolean)
            .join(' · ') || 'Off'
        }
        expanded={expandedSection === 'research'}
        onToggle={() => toggleSection('research')}
      >
        <AutomationSettingsInline
          settings={state.userSettings}
          onChange={(updates) => dispatch({ type: 'SET_USER_SETTINGS', settings: updates })}
        />
      </ConfigSection>
    </div>
  )
}

// ── Collapsible config section ──
function ConfigSection({
  id,
  icon,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  id: string
  icon: React.ReactNode
  title: string
  subtitle?: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={`rounded-lg border transition-all ${
        expanded ? 'border-border bg-surface-card/50' : 'border-border/30 hover:border-border/60'
      }`}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left cursor-pointer hover:bg-white/[0.02] transition-colors rounded-lg"
      >
        {icon}
        <span className="text-xs font-medium text-zinc-300">{title}</span>
        {subtitle && <span className="text-[11px] text-zinc-600 truncate flex-1">{subtitle}</span>}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-zinc-600 shrink-0 ml-auto" />
        ) : (
          <ChevronRight className="h-3 w-3 text-zinc-600 shrink-0 ml-auto" />
        )}
      </button>
      {expanded && (
        <div className="animate-fade-in border-t border-border/30 px-3 py-3">{children}</div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════
// Theme Selector — inline version
// ══════════════════════════════════════════════════
function ThemeSelector() {
  const { state, dispatch } = useApp()
  const deck = getActiveDeck(state.project)
  const currentTheme = deck?.theme ?? THEME_PRESETS[0]

  const [sdkThemes, setSdkThemes] = useState<SdkThemeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<ThemeCategory>('preset')
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const loadThemes = useCallback(async () => {
    setLoading(true)
    setSdkError(null)
    try {
      const catParam = category === 'all' || category === 'preset' ? '' : category
      const res = await apiSearchThemes(searchQuery || undefined, catParam || undefined, 50)
      if (res.ok && res.data && res.data.length > 0) {
        setSdkThemes(res.data)
        setSdkError(null)
      } else {
        setSdkThemes([])
        setSdkError(
          res.ok
            ? 'No SDK theme data available'
            : (res as { error?: string }).error || 'Theme service not responding',
        )
      }
    } catch (e) {
      setSdkThemes([])
      setSdkError(`Connection failed: ${(e as Error).message || 'Network error'}`)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, category])

  useEffect(() => {
    if (category !== 'preset') loadThemes()
    else setLoading(false)
  }, [loadThemes, category, retryCount])

  const selectPresetTheme = (theme: ThemePreset) => {
    if (!deck) return
    dispatch({ type: 'SET_DECK_THEME', deckId: deck.id, theme })
    dispatch({ type: 'ADD_LOG', message: `「${deck.title}」theme changed to: ${theme.name}` })
  }

  const selectSdkTheme = (sdkTheme: SdkThemeItem) => {
    if (!deck) return
    const theme: ThemePreset = {
      id: `sdk-${sdkTheme.id}`,
      name: sdkTheme.name,
      appearance: 'dark',
      colorScheme: currentTheme.colorScheme,
      fontScheme: currentTheme.fontScheme,
      sdkThemeId: sdkTheme.id,
      componentCount: sdkTheme.componentCount,
    }
    dispatch({ type: 'SET_DECK_THEME', deckId: deck.id, theme })
    dispatch({
      type: 'ADD_LOG',
      message: `「${deck.title}」theme changed to SDK theme: ${sdkTheme.name}`,
    })
  }

  const getCategoryColor = (cat: string) => {
    if (cat === 'cover') return 'text-purple-400 bg-purple-500/10'
    if (cat === 'report') return 'text-blue-400 bg-blue-500/10'
    return 'text-amber-400 bg-amber-500/10'
  }

  return (
    <div className="space-y-2">
      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-600" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search themes..."
          className="w-full rounded-md border border-border/50 bg-surface/50 pl-6 pr-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none"
        />
      </div>

      {/* Category tags */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] transition ${
              category === cat.id
                ? 'bg-brand-500/15 font-medium text-brand-300'
                : 'text-zinc-500 hover:bg-surface-3 hover:text-zinc-300'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Theme grid */}
      <div className="max-h-48 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            <span className="ml-2 text-[11px] text-zinc-500">Loading SDK themes...</span>
          </div>
        ) : category !== 'preset' && sdkThemes.length > 0 ? (
          /* SDK themes loaded */
          <div className="grid grid-cols-2 gap-1.5">
            {sdkThemes.slice(0, 12).map((sdkTheme) => {
              const isActive = currentTheme.sdkThemeId === sdkTheme.id
              return (
                <button
                  key={sdkTheme.id}
                  onClick={() => selectSdkTheme(sdkTheme)}
                  className={`rounded-lg border p-1.5 text-left transition ${
                    isActive
                      ? 'border-brand-500/50 bg-brand-500/5'
                      : 'border-border/30 hover:border-border-hover hover:bg-surface-hover'
                  }`}
                >
                  {sdkTheme.thumbnailUrl ? (
                    <img
                      src={sdkTheme.thumbnailUrl}
                      alt={sdkTheme.name}
                      className="h-12 w-full rounded object-cover mb-1"
                      loading="lazy"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="h-12 w-full rounded bg-zinc-900/30 flex items-center justify-center mb-1">
                      <Palette className="h-4 w-4 text-zinc-700" />
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span
                      className={`rounded-full px-1 py-0.5 text-[8px] ${getCategoryColor(sdkTheme.category)}`}
                    >
                      {sdkTheme.category === 'cover'
                        ? 'Cover'
                        : sdkTheme.category === 'report'
                          ? 'Report'
                          : 'Template'}
                    </span>
                    <p className="text-[10px] font-medium text-zinc-300 truncate">
                      {sdkTheme.name}
                    </p>
                    {isActive && <Check className="h-2.5 w-2.5 text-brand-400 shrink-0 ml-auto" />}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          /* Built-in presets — for 'preset' category or when SDK fails */
          <div>
            {category !== 'preset' && sdkError && (
              <div className="flex items-center justify-between mb-2 px-1 py-1.5 rounded-md bg-red-500/5 border border-red-500/15">
                <span className="text-[10px] text-red-400/80">{sdkError}</span>
                <button
                  onClick={() => setRetryCount((c) => c + 1)}
                  className="shrink-0 ml-2 rounded px-2 py-0.5 text-[10px] font-medium text-brand-300 bg-brand-500/10 hover:bg-brand-500/20 transition"
                >
                  Retry
                </button>
              </div>
            )}
            {category !== 'preset' && !sdkError && (
              <p className="text-[10px] text-zinc-600 mb-1.5">
                No SDK themes found, showing built-in presets
              </p>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {THEME_PRESETS.map((theme) => {
                const isActive = currentTheme.id === theme.id
                return (
                  <button
                    key={theme.id}
                    onClick={() => selectPresetTheme(theme)}
                    className={`rounded-lg border p-2 text-left transition ${
                      isActive
                        ? 'border-brand-500/50 bg-brand-500/5'
                        : 'border-border/30 hover:border-border-hover hover:bg-surface-hover'
                    }`}
                  >
                    <div
                      className="mb-1.5 h-8 w-full rounded"
                      style={{ background: theme.preview || '#1a365d' }}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium text-zinc-200 truncate">{theme.name}</p>
                      {isActive && (
                        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-500">
                          <Check className="h-2 w-2 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex gap-0.5">
                      {[
                        theme.colorScheme.dk1,
                        theme.colorScheme.accent1,
                        theme.colorScheme.accent2,
                      ].map((color, i) => (
                        <div
                          key={i}
                          className="h-2 w-2 rounded-full border border-border/30"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Current theme */}
      <div className="text-[9px] text-zinc-600">
        Current: <span className="text-zinc-400 font-medium">{currentTheme.name}</span>
        {currentTheme.sdkThemeId && (
          <span className="ml-1 rounded bg-brand-500/10 px-1 py-0.5 text-[8px] text-brand-400">
            SDK
          </span>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// PPT Settings — inline version (compact)
// ══════════════════════════════════════════════════
function PptSettingsInline({
  settings,
  onChange,
}: {
  settings: PptSettings
  onChange: (updates: Partial<PptSettings>) => void
}) {
  return (
    <div className="space-y-3">
      {/* Aspect ratio */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Aspect Ratio</span>
        <div className="flex gap-1">
          {(['16:9', '4:3', '16:10'] as const).map((ratio) => (
            <button
              key={ratio}
              onClick={() => onChange({ aspectRatio: ratio })}
              className={`rounded px-2.5 py-1 text-xs font-medium border transition ${
                settings.aspectRatio === ratio
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                  : 'border-border/30 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Target slide count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Target Slides</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange({ slideCount: 'auto' })}
            className={`rounded px-2.5 py-1 text-xs font-medium border transition ${
              settings.slideCount === 'auto'
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                : 'border-border/30 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Auto
          </button>
          <input
            type="number"
            value={settings.slideCount === 'auto' ? '' : settings.slideCount}
            onChange={(e) =>
              onChange({ slideCount: e.target.value ? parseInt(e.target.value) : 'auto' })
            }
            placeholder="Count"
            min={3}
            max={100}
            className="w-16 rounded border border-border/30 bg-surface/50 px-2 py-1 text-xs text-zinc-200 focus:border-brand-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Content style */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Content Style</span>
        <div className="flex gap-1">
          {(
            [
              { key: 'concise', label: 'Concise' },
              { key: 'detailed', label: 'Detailed' },
              { key: 'visual', label: 'Visual' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onChange({ contentStyle: key })}
              className={`rounded px-2.5 py-1 text-xs font-medium border transition ${
                settings.contentStyle === key
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                  : 'border-border/30 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* PPT language */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">PPT Language</span>
        <select
          value={settings.language}
          onChange={(e) => onChange({ language: e.target.value as PptSettings['language'] })}
          className="rounded border border-border/30 bg-surface/50 px-2.5 py-1 text-xs text-zinc-200 focus:outline-none"
        >
          <option value="auto">Follow Materials</option>
          <option value="zh">Chinese</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* Toggle items */}
      <div className="flex items-center gap-3 flex-wrap">
        <MiniToggle
          label="Speaker Notes"
          checked={settings.speakerNotes}
          onChange={(v) => onChange({ speakerNotes: v })}
        />
        <MiniToggle
          label="Charts First"
          checked={settings.chartsPreferred}
          onChange={(v) => onChange({ chartsPreferred: v })}
        />
      </div>

      {/* Export format */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Export Format</span>
        <div className="flex gap-1">
          {(
            [
              { key: 'pptx', label: 'PPTX' },
              { key: 'pdf', label: 'PDF' },
              { key: 'both', label: 'Both' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onChange({ exportFormat: key })}
              className={`rounded px-2.5 py-1 text-xs font-medium border transition ${
                settings.exportFormat === key
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                  : 'border-border/30 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// AI Automation / Deep Research Settings — inline version
// ══════════════════════════════════════════════════
function AutomationSettingsInline({
  settings,
  onChange,
}: {
  settings: UserSettings
  onChange: (updates: Partial<UserSettings>) => void
}) {
  return (
    <div className="space-y-2.5">
      {/* Automation toggles */}
      <div className="grid grid-cols-2 gap-2">
        <MiniToggle
          label="Auto Curate"
          checked={settings.autoCurate}
          onChange={(v) => onChange({ autoCurate: v })}
          icon={<Sparkles className="h-2.5 w-2.5 text-amber-400" />}
        />
        <MiniToggle
          label="Grinder Mode"
          checked={settings.autoPipeline}
          onChange={(v) => onChange({ autoPipeline: v })}
          icon={<Zap className="h-2.5 w-2.5 text-orange-400" />}
        />
      </div>

      {/* Heartbeat mechanism */}
      <div className="rounded-md border border-border/20 bg-surface/30 px-2.5 py-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <Heart className="h-3 w-3 text-pink-400" />
          <span className="text-[10px] font-medium text-zinc-400">Heartbeat Auto Mode</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MiniToggle
            label="Auto Inspire"
            checked={settings.autoInspire}
            onChange={(v) => onChange({ autoInspire: v })}
          />
          <MiniToggle
            label="Auto Deep Research"
            checked={settings.autoResearch}
            onChange={(v) => onChange({ autoResearch: v })}
          />
          <MiniToggle
            label="Auto Consume Todos"
            checked={settings.autoConsumeTodos}
            onChange={(v) => onChange({ autoConsumeTodos: v })}
          />
        </div>
        {/* Heartbeat interval */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-600">Heartbeat Interval</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={settings.heartbeatInterval}
              onChange={(e) =>
                onChange({ heartbeatInterval: Math.max(30, parseInt(e.target.value) || 120) })
              }
              min={30}
              max={600}
              className="w-14 rounded border border-border/30 bg-surface/50 px-1.5 py-0.5 text-[10px] text-zinc-200 focus:border-brand-500/50 focus:outline-none"
            />
            <span className="text-[10px] text-zinc-600">sec</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mini Toggle component ──
function MiniToggle({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs border transition ${
        checked
          ? 'border-brand-500/30 bg-brand-500/5 text-brand-300'
          : 'border-border/20 text-zinc-500 hover:text-zinc-300 hover:border-border/40'
      }`}
    >
      {icon}
      <span>{label}</span>
      <div
        className={`h-2.5 w-5 rounded-full transition ml-auto ${checked ? 'bg-brand-500' : 'bg-zinc-700'}`}
      >
        <div
          className={`h-2.5 w-2.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-2.5' : ''}`}
        />
      </div>
    </button>
  )
}
