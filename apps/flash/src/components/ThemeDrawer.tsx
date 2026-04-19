import { Award, BookOpen, Check, Grid, Loader2, Palette, Search, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { searchThemes as apiSearchThemes } from '../api'
import { getActiveDeck, useApp } from '../store'
import { THEME_PRESETS } from '../themes'
import type { SdkThemeItem, ThemePreset } from '../types'

interface ThemeDrawerProps {
  onClose: () => void
}

type ThemeCategory = 'all' | 'cover' | 'report' | 'official' | 'preset'

const CATEGORIES: { id: ThemeCategory; label: string; icon: typeof Palette }[] = [
  { id: 'all', label: 'All', icon: Grid },
  { id: 'cover', label: 'Cover Style', icon: Palette },
  { id: 'report', label: 'Work Report', icon: BookOpen },
  { id: 'official', label: 'Official Templates', icon: Award },
  { id: 'preset', label: 'Built-in Presets', icon: Palette },
]

export default function ThemeDrawer({ onClose }: ThemeDrawerProps) {
  const { state, dispatch } = useApp()
  const deck = getActiveDeck(state.project)
  const currentTheme = deck?.theme ?? THEME_PRESETS[0]

  const [sdkThemes, setSdkThemes] = useState<SdkThemeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<ThemeCategory>('all')
  const [totalThemes, setTotalThemes] = useState(0)

  // Load SDK themes
  const loadThemes = useCallback(async () => {
    setLoading(true)
    try {
      const catParam = category === 'all' || category === 'preset' ? '' : category
      const res = await apiSearchThemes(searchQuery || undefined, catParam || undefined, 50)
      if (res.ok && res.data) {
        setSdkThemes(res.data)
        if (res.total) setTotalThemes(res.total)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [searchQuery, category])

  useEffect(() => {
    if (category !== 'preset') {
      loadThemes()
    } else {
      setLoading(false)
    }
  }, [loadThemes, category])

  // Select a preset theme (built-in)
  const selectPresetTheme = (theme: ThemePreset) => {
    if (!deck) return
    dispatch({ type: 'SET_DECK_THEME', deckId: deck.id, theme })
    dispatch({ type: 'ADD_LOG', message: `「${deck.title}」theme changed to: ${theme.name}` })
  }

  // Select an SDK theme — create a ThemePreset from SDK theme metadata
  const selectSdkTheme = (sdkTheme: SdkThemeItem) => {
    if (!deck) return
    // Create a theme preset referencing the SDK theme
    const theme: ThemePreset = {
      id: `sdk-${sdkTheme.id}`,
      name: sdkTheme.name,
      appearance: 'dark', // Default, can be overridden
      colorScheme: currentTheme.colorScheme, // Keep current colors as base
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
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-sidebar animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Palette className="h-3 w-3 text-purple-400 shrink-0" />
            <h2 className="text-[11px] font-semibold text-zinc-400">Theme Style</h2>
          </div>
          {deck && (
            <p className="mt-0.5 text-[10px] text-zinc-600 truncate">
              {deck.title} {totalThemes > 0 && `· ${totalThemes} SDK themes`}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-zinc-600 transition hover:text-zinc-300"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {!deck ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-xs text-zinc-600">Please select a Deck first to set theme</p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search themes..."
                className="w-full rounded-md border border-border bg-surface-2 pl-7 pr-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] transition ${
                  category === cat.id
                    ? 'bg-brand-500/15 font-medium text-brand-300'
                    : 'text-zinc-500 hover:bg-surface-3 hover:text-zinc-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Theme List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              </div>
            ) : category === 'preset' ? (
              /* Built-in presets */
              THEME_PRESETS.map((theme) => {
                const isActive = currentTheme.id === theme.id
                return (
                  <button
                    key={theme.id}
                    onClick={() => selectPresetTheme(theme)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      isActive
                        ? 'border-brand-500/50 bg-brand-500/5'
                        : 'border-border hover:border-border-hover hover:bg-surface-hover'
                    }`}
                  >
                    <div
                      className="mb-2 h-14 w-full rounded-md"
                      style={{ background: theme.preview || '#1a365d' }}
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-zinc-200">{theme.name}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-600">
                          {theme.appearance === 'dark' ? 'Dark' : 'Light'} ·{' '}
                          {theme.fontScheme.majorFont}
                        </p>
                      </div>
                      {isActive && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex gap-1">
                      {[
                        theme.colorScheme.dk1,
                        theme.colorScheme.accent1,
                        theme.colorScheme.accent2,
                        theme.colorScheme.accent3,
                        theme.colorScheme.lt1,
                      ].map((color, i) => (
                        <div
                          key={i}
                          className="h-3.5 w-3.5 rounded-full border border-border/50"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </button>
                )
              })
            ) : /* SDK themes */
            sdkThemes.length === 0 ? (
              <div className="text-center py-12">
                <Palette className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">
                  {searchQuery ? 'No matching themes' : 'SDK themes not loaded'}
                </p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Make sure the SDK themes directory is mounted
                </p>
              </div>
            ) : (
              sdkThemes.map((sdkTheme) => {
                const isActive = currentTheme.sdkThemeId === sdkTheme.id
                return (
                  <button
                    key={sdkTheme.id}
                    onClick={() => selectSdkTheme(sdkTheme)}
                    className={`w-full rounded-lg border p-2 text-left transition ${
                      isActive
                        ? 'border-brand-500/50 bg-brand-500/5'
                        : 'border-border hover:border-border-hover hover:bg-surface-hover'
                    }`}
                  >
                    {/* Thumbnail preview */}
                    {sdkTheme.thumbnailUrl ? (
                      <div className="mb-1.5 overflow-hidden rounded border border-border/30 bg-zinc-900/50">
                        <img
                          src={sdkTheme.thumbnailUrl}
                          alt={sdkTheme.name}
                          className="h-20 w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </div>
                    ) : (
                      <div className="mb-1.5 flex h-20 w-full items-center justify-center rounded border border-border/30 bg-zinc-900/30">
                        <Palette className="h-6 w-6 text-zinc-700" />
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${getCategoryColor(sdkTheme.category)}`}
                        >
                          {sdkTheme.category === 'cover'
                            ? 'Cover'
                            : sdkTheme.category === 'report'
                              ? 'Report'
                              : 'Template'}
                        </span>
                        <p className="text-xs font-medium text-zinc-200">{sdkTheme.name}</p>
                      </div>
                      {isActive && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    {sdkTheme.description && (
                      <p className="text-[10px] text-zinc-500 line-clamp-2 mb-1.5">
                        {sdkTheme.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                      <span>{sdkTheme.componentCount} components</span>
                      {sdkTheme.keywords && (
                        <>
                          <span>·</span>
                          <span className="truncate">{sdkTheme.keywords.slice(0, 40)}</span>
                        </>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Current theme info */}
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-[10px] text-zinc-600">
              Current: <span className="text-zinc-400 font-medium">{currentTheme.name}</span>
              {currentTheme.sdkThemeId && (
                <span className="ml-1 rounded bg-brand-500/10 px-1 py-0.5 text-[9px] text-brand-400">
                  SDK
                </span>
              )}
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
