/* ─────────────────────────────────────────────────────────────────────────────
 *  Shadow OS — Widget Picker  (v2 — Visual Mini Store)
 *
 *  A slide-in panel for browsing + adding widgets, designed to feel like a
 *  mini app-store rather than a code file list. Features:
 *   - Visual preview cards with gradient thumbnails
 *   - Category tabs (生产器械 / Buddy 空间 / 自动化链路)
 *   - Hover preview with glow / scale animation
 *   - One-click add with permission badges
 * ───────────────────────────────────────────────────────────────────────────── */

import { cn, Input } from '@shadowob/ui'
import {
  Box,
  Hash,
  MessageSquare,
  PawPrint,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useWidgetEngine,
  type WidgetInstance,
  type WidgetManifest,
} from '../../../lib/widget-engine'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Sparkles,
  TrendingUp,
  PawPrint,
  Zap,
  Hash,
  MessageSquare,
  Box,
}

/** Category definitions — maps tag → display name i18n key + icon */
const CATEGORIES = [
  { tag: null, labelKey: 'widget.catAll', icon: Sparkles },
  { tag: 'production', labelKey: 'widget.catProduction', icon: Box },
  { tag: 'buddy', labelKey: 'widget.catBuddy', icon: PawPrint },
  { tag: 'automation', labelKey: 'widget.catAutomation', icon: Zap },
  { tag: 'identity', labelKey: 'widget.catIdentity', icon: Sparkles },
] as const

interface WidgetPickerProps {
  onClose: () => void
  onAdd: (instance: WidgetInstance) => void
}

export function WidgetPicker({ onClose, onAdd }: WidgetPickerProps) {
  const { t } = useTranslation()
  const { registry } = useWidgetEngine()
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Filter by search + category
  const filtered = useMemo(() => {
    let result = registry
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (m) =>
          t(m.name, m.name).toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          (m.description && t(m.description, m.description).toLowerCase().includes(q)),
      )
    }
    if (activeCategory) {
      result = result.filter((m) => m.tags?.includes(activeCategory))
    }
    return result
  }, [registry, search, activeCategory, t])

  function handleAdd(manifest: WidgetManifest) {
    const instance: WidgetInstance = {
      instanceId: `wi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      widgetId: manifest.id,
      rect: {
        ...manifest.defaultRect,
        /* Offset so new widgets don't overlap defaults */
        x: manifest.defaultRect.x + 30 + Math.random() * 60,
        y: manifest.defaultRect.y + 30 + Math.random() * 60,
        z: 20,
      },
      appearance: {},
      config: {},
      grantedPermissions: [...manifest.permissions],
      visible: true,
    }
    onAdd(instance)
  }

  return (
    <div className="absolute inset-y-0 right-0 w-[340px] bg-bg-deep/95 backdrop-blur-3xl border-l border-white/[0.06] z-50 flex flex-col animate-in slide-in-from-right-full duration-300 shadow-[−20px_0_60px_-10px_rgba(0,0,0,0.5)]">
      {/* ── Header ── */}
      <div className="h-14 px-5 flex items-center border-b border-white/[0.04] shrink-0">
        <div className="flex-1">
          <h2 className="text-sm font-black text-text-primary tracking-tight">
            {t('widget.pickerTitle', '组件市场')}
          </h2>
          <p className="text-[10px] text-text-muted/60 -mt-0.5">
            {t('widget.pickerSubtitle', '拖入画布即用')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl text-text-muted/60 hover:text-text-primary hover:bg-white/[0.06] transition"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Search ── */}
      <div className="px-4 pt-3 pb-1">
        <Input
          icon={Search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('widget.searchWidgets', '搜索组件...')}
          className="!rounded-2xl !bg-white/[0.04] !border-white/[0.06]"
        />
      </div>

      {/* ── Category tabs ── */}
      <div className="px-4 py-2 flex items-center gap-1 overflow-x-auto scrollbar-hidden">
        {CATEGORIES.map((cat) => {
          const CatIcon = cat.icon
          const isActive = activeCategory === cat.tag
          return (
            <button
              key={cat.tag ?? 'all'}
              type="button"
              onClick={() => setActiveCategory(cat.tag)}
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-black tracking-wide px-3 py-1.5 rounded-xl transition-all shrink-0',
                isActive
                  ? 'bg-primary/15 text-primary shadow-sm shadow-primary/10'
                  : 'text-text-muted/60 hover:text-text-muted hover:bg-white/[0.04]',
              )}
            >
              <CatIcon size={12} />
              {t(cat.labelKey, cat.labelKey)}
            </button>
          )
        })}
      </div>

      {/* ── Widget preview grid ── */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden px-4 py-2 space-y-3">
        {filtered.map((manifest) => {
          const IconComp = ICON_MAP[manifest.icon ?? ''] ?? Sparkles
          const gradientClass = manifest.previewGradient ?? 'from-primary/20 to-accent/10'
          return (
            <button
              type="button"
              key={manifest.id}
              onClick={() => handleAdd(manifest)}
              className="w-full text-left group relative overflow-hidden rounded-2xl border border-white/[0.06] hover:border-primary/30 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:scale-[1.01] active:scale-[0.99]"
            >
              {/* Preview gradient thumbnail */}
              <div
                className={cn(
                  'h-24 bg-gradient-to-br flex items-center justify-center relative overflow-hidden',
                  gradientClass,
                )}
              >
                {/* Animated icon */}
                <IconComp
                  size={36}
                  className="text-text-primary/20 group-hover:text-text-primary/40 transition-all duration-500 group-hover:scale-110"
                />
                {/* Glow on hover */}
                <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-colors duration-500" />
                {/* Add button overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                    <Plus size={14} className="text-bg-deep" />
                  </div>
                </div>
              </div>
              {/* Info area */}
              <div className="px-3.5 py-2.5">
                <div className="text-xs font-black text-text-primary truncate">
                  {t(manifest.name, manifest.name)}
                </div>
                {manifest.description && (
                  <div className="text-[10px] text-text-muted/70 truncate mt-0.5 leading-relaxed">
                    {t(manifest.description, manifest.description)}
                  </div>
                )}
                {manifest.permissions.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {manifest.permissions.map((p) => (
                      <span
                        key={p}
                        className="text-[8px] font-bold text-accent/80 bg-accent/[0.08] px-1.5 py-0.5 rounded-full"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-text-muted/40">
            <Search size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-xs font-bold">{t('widget.noResults', '没有找到组件')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
