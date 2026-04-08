/* ─────────────────────────────────────────────────────────────────────────────
 *  Shadow OS — Widget Canvas  (v2 — Micro-Program Container)
 *
 *  Orchestrates the Infinite Canvas + Widget Shells.
 *
 *  Design evolution from v1:
 *   1. Widgets are borderless by default — content floats on canvas.
 *   2. Built-in content uses data-driven visuals (ring charts, orbital
 *      avatars, animated flow connections) instead of static text lists.
 *   3. Toolbar is minimal, floating, glass-morphism.
 *   4. Widget Picker is a visual "Mini Store" (see WidgetPicker v2).
 * ───────────────────────────────────────────────────────────────────────────── */

import { Button, cn } from '@shadowob/ui'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  Copy,
  FileText,
  Hash,
  MessageSquare,
  PawPrint,
  Pencil,
  Plus,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { BUILTIN_WIDGETS, useWidgetEngine, type WidgetInstance } from '../../../lib/widget-engine'
import { InfiniteCanvas } from './InfiniteCanvas'
import { WidgetIframe } from './WidgetIframe'
import { WidgetPicker } from './WidgetPicker'
import { WidgetShell } from './WidgetShell'

// biome-ignore lint/suspicious/noExplicitAny: TFunction from react-i18next has complex generics
type TranslateFn = (...args: any[]) => any

/* ── Types ── */

interface ServerDetail {
  id: string
  name: string
  slug: string
  description: string | null
  iconUrl: string | null
  bannerUrl: string | null
  homepageHtml: string | null
  isPublic: boolean
}

interface ChannelInfo {
  id: string
  name: string
  type: string
  lastMessageAt?: string | null
}

interface BuddyMember {
  userId: string
  user?: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    isBot: boolean
    status: string
  }
}

interface WidgetCanvasProps {
  server: ServerDetail
  channels: ChannelInfo[]
  buddyMembers: BuddyMember[]
  copied: boolean
  onCopyLink: () => void
}

/* ── Built-in widget renderer ── */

function useBuiltinWidgetRenderer(
  server: ServerDetail,
  channels: ChannelInfo[],
  buddyMembers: BuddyMember[],
  copied: boolean,
  onCopyLink: () => void,
) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const serverSlug = server.slug || server.id

  return useCallback(
    (widgetId: string): React.ReactNode | null => {
      switch (widgetId) {
        case 'builtin:hero-banner':
          return <HeroBannerContent server={server} copied={copied} onCopyLink={onCopyLink} t={t} />
        case 'builtin:activity-feed':
          return (
            <ActivityFeedContent
              channels={channels}
              buddyMembers={buddyMembers}
              serverSlug={serverSlug}
              navigate={navigate}
              t={t}
            />
          )
        case 'builtin:buddy-roster':
          return <BuddyRosterContent buddyMembers={buddyMembers} t={t} />
        case 'builtin:quick-actions':
          return <QuickActionsContent serverSlug={serverSlug} navigate={navigate} t={t} />
        case 'builtin:channel-overview':
          return (
            <ChannelOverviewContent
              channels={channels}
              serverSlug={serverSlug}
              navigate={navigate}
              t={t}
            />
          )
        default:
          return null
      }
    },
    [server, channels, buddyMembers, copied, onCopyLink, serverSlug, navigate, t],
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Main Canvas
 * ════════════════════════════════════════════════════════════════════════════ */

export function WidgetCanvas({
  server,
  channels,
  buddyMembers,
  copied,
  onCopyLink,
}: WidgetCanvasProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    layout,
    isEditing,
    setEditing,
    pickerOpen,
    setPickerOpen,
    addWidget,
    registerWidget,
    registry,
  } = useWidgetEngine()

  // Register built-in widgets on mount
  useEffect(() => {
    for (const manifest of BUILTIN_WIDGETS) registerWidget(manifest)
  }, [registerWidget])

  // Auto-populate default layout if empty
  useEffect(() => {
    if (layout.widgets.length > 0 || registry.length === 0) return
    const defaults: WidgetInstance[] = BUILTIN_WIDGETS.map((m, i) => ({
      instanceId: `default_${m.id}`,
      widgetId: m.id,
      rect: { ...m.defaultRect, z: i },
      appearance: {},
      config: {},
      grantedPermissions: [...m.permissions],
      visible: true,
    }))
    for (const d of defaults) addWidget(d)
  }, [layout.widgets.length, registry.length, addWidget])

  const renderWidget = useBuiltinWidgetRenderer(server, channels, buddyMembers, copied, onCopyLink)

  const sortedWidgets = useMemo(
    () => [...layout.widgets].sort((a, b) => a.rect.z - b.rect.z),
    [layout.widgets],
  )

  const getManifest = useCallback(
    (widgetId: string) => registry.find((m) => m.id === widgetId),
    [registry],
  )

  const handleAddWidget = useCallback(
    (instance: WidgetInstance) => {
      addWidget(instance)
      setPickerOpen(false)
    },
    [addWidget, setPickerOpen],
  )

  return (
    <div className="flex-1 relative overflow-hidden bg-bg-deep">
      <InfiniteCanvas>
        {sortedWidgets.map((instance) => {
          const manifest = getManifest(instance.widgetId)
          const builtinContent = renderWidget(instance.widgetId)
          return (
            <WidgetShell key={instance.instanceId} instance={instance} manifest={manifest}>
              {builtinContent ?? (
                <WidgetIframe
                  instance={instance}
                  onNavigate={(url) => {
                    try {
                      const parsed = new URL(url, window.location.origin)
                      if (parsed.origin === window.location.origin) {
                        void navigate({ to: parsed.pathname + parsed.search + parsed.hash })
                      } else {
                        window.open(url, '_blank', 'noopener,noreferrer')
                      }
                    } catch {
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }
                  }}
                />
              )}
            </WidgetShell>
          )
        })}
      </InfiniteCanvas>

      {/* ── Floating toolbar (top-right) ── */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 z-50">
        <Button
          variant={isEditing ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setEditing(!isEditing)}
          className={cn(
            'rounded-2xl text-[11px] font-black gap-1.5 backdrop-blur-2xl',
            !isEditing &&
              'bg-bg-deep/60 border border-white/[0.06] text-text-muted hover:text-text-primary',
          )}
        >
          <Pencil size={12} />
          {isEditing ? t('widget.doneEditing', '完成') : t('widget.editCanvas', '编辑画布')}
        </Button>
        {isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="rounded-2xl text-[11px] font-black gap-1.5 bg-bg-deep/60 border border-white/[0.06] text-text-muted hover:text-text-primary backdrop-blur-2xl"
          >
            <Plus size={12} />
            {t('widget.addWidget', '添加')}
          </Button>
        )}
      </div>

      {/* ── Edit mode banner ── */}
      {isEditing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-2xl bg-primary/10 backdrop-blur-2xl border border-primary/20 text-primary text-[10px] font-black tracking-widest uppercase flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          {t('widget.editMode', '画布编辑中')}
        </div>
      )}

      {/* ── Widget Picker ── */}
      {pickerOpen && <WidgetPicker onClose={() => setPickerOpen(false)} onAdd={handleAddWidget} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Built-in Widget Content (v2 — Data-driven visuals)
 *
 *  These render INSIDE WidgetShell without their own container.
 *  Borderless widgets have no padding — they float directly on canvas.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ── Hero Banner — Floating identity with gradient orbs ── */
function HeroBannerContent({
  server,
  copied,
  onCopyLink,
  t,
}: {
  server: ServerDetail
  copied: boolean
  onCopyLink: () => void
  t: TranslateFn
}) {
  const initial = server.name.charAt(0).toUpperCase()

  return (
    <div className="relative flex items-center gap-5">
      {/* Background glow orb */}
      <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full bg-primary/[0.12] blur-[60px] pointer-events-none" />

      {/* Server avatar with glow ring */}
      <div className="relative shrink-0">
        {server.iconUrl ? (
          <img
            src={server.iconUrl}
            alt=""
            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-primary/20 shadow-xl shadow-primary/10"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/80 to-accent/60 flex items-center justify-center text-bg-deep font-black text-2xl ring-2 ring-primary/20 shadow-xl shadow-primary/10">
            {initial}
          </div>
        )}
        {/* Online pulse */}
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-success border-2 border-bg-deep animate-pulse" />
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-black text-text-primary truncate tracking-tight">
          {server.name}
        </h1>
        {server.description && (
          <p className="text-xs text-text-muted/60 mt-0.5 line-clamp-1">{server.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {server.isPublic && (
            <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {t('serverHome.publicBadge', 'PUBLIC')}
            </span>
          )}
          <button
            type="button"
            onClick={onCopyLink}
            className="text-[10px] font-bold text-text-muted/50 hover:text-primary transition flex items-center gap-1"
          >
            {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
            {t('serverHome.copyLink', '复制链接')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Activity Feed — With animated flow indicators ── */
function ActivityFeedContent({
  channels,
  buddyMembers,
  serverSlug,
  navigate,
  t,
}: {
  channels: ChannelInfo[]
  buddyMembers: BuddyMember[]
  serverSlug: string
  navigate: ReturnType<typeof useNavigate>
  t: TranslateFn
}) {
  const recentChannels = [...channels]
    .filter((ch) => ch.lastMessageAt)
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
    .slice(0, 5)
  const activeBuddies = buddyMembers.filter((m) => m.user?.status === 'online')

  return (
    <div className="h-full flex flex-col">
      {/* Header with pulse indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <TrendingUp size={16} className="text-primary" />
          {recentChannels.length > 0 && (
            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-ping" />
          )}
        </div>
        <span className="text-xs font-black text-text-primary/80 tracking-tight">
          {t('serverHome.widgetActivity', '数据流')}
        </span>
        <span className="text-[9px] text-text-muted/40 ml-auto">{t('widget.live', 'LIVE')}</span>
      </div>

      {/* Active Buddy banner */}
      {activeBuddies.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-accent/[0.06] border border-accent/[0.08] mb-2">
          <div className="relative">
            <PawPrint size={12} className="text-accent" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          </div>
          <span className="text-[10px] text-text-muted/70 truncate">
            <span className="font-bold text-accent/90">
              {activeBuddies[0]?.user?.displayName ?? activeBuddies[0]?.user?.username}
            </span>{' '}
            {activeBuddies.length > 1
              ? t('serverHome.buddiesOnline', {
                  count: activeBuddies.length,
                  defaultValue: `等 ${activeBuddies.length} 个 Buddy 在线`,
                })
              : t('serverHome.buddyOnline', '活跃中')}
          </span>
        </div>
      )}

      {/* Channel stream with flow lines */}
      <div className="flex-1 space-y-0.5 overflow-hidden">
        {recentChannels.map((ch, i) => (
          <button
            type="button"
            key={ch.id}
            onClick={() =>
              navigate({
                to: '/servers/$serverSlug/channels/$channelId',
                params: { serverSlug, channelId: ch.id },
              })
            }
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.04] transition-all w-full text-left group relative"
          >
            {/* Flow line dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0 group-hover:bg-primary transition-colors" />
            {/* Connector line */}
            {i < recentChannels.length - 1 && (
              <div className="absolute left-[14.5px] top-[22px] w-px h-3 bg-gradient-to-b from-primary/20 to-transparent" />
            )}
            <Hash
              size={11}
              className="text-text-muted/30 shrink-0 group-hover:text-primary/60 transition-colors"
            />
            <span className="text-[11px] text-text-muted/70 group-hover:text-text-primary truncate font-bold flex-1">
              {ch.name}
            </span>
            <span className="text-[9px] text-text-muted/30 shrink-0 tabular-nums">
              {ch.lastMessageAt
                ? new Date(ch.lastMessageAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </span>
          </button>
        ))}
        {recentChannels.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[10px] text-text-muted/30">
              {t('serverHome.noActivity', '暂无数据流')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Buddy Roster — Orbital floating avatars ── */
function BuddyRosterContent({ buddyMembers, t }: { buddyMembers: BuddyMember[]; t: TranslateFn }) {
  const allBuddies = buddyMembers.filter((m) => m.user?.isBot)

  return (
    <div className="relative h-full">
      {/* Floating label */}
      <div className="flex items-center gap-1.5 mb-3">
        <PawPrint size={14} className="text-accent/70" />
        <span className="text-xs font-black text-text-primary/70 tracking-tight">
          {t('serverHome.widgetBuddies', 'Buddy 空间')}
        </span>
        {allBuddies.length > 0 && (
          <span className="text-[9px] font-bold text-accent/60 bg-accent/[0.08] px-1.5 py-0.5 rounded-full ml-auto">
            {allBuddies.length}
          </span>
        )}
      </div>

      {allBuddies.length > 0 ? (
        /* Orbital layout — avatars arranged in a staggered grid with glow */
        <div className="flex flex-wrap gap-3 justify-center items-start pt-2">
          {allBuddies.slice(0, 6).map((m, i) => {
            const isOnline = m.user?.status === 'online'
            /* Alternate sizes for visual rhythm */
            const isLarge = i < 2
            const size = isLarge ? 'w-14 h-14' : 'w-11 h-11'
            return (
              <div
                key={m.userId}
                className="flex flex-col items-center gap-1.5 group"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="relative">
                  {m.user?.avatarUrl ? (
                    <img
                      src={m.user.avatarUrl}
                      alt=""
                      className={cn(
                        size,
                        'rounded-full object-cover transition-transform duration-300 group-hover:scale-110',
                        isOnline
                          ? 'ring-2 ring-accent/40 shadow-lg shadow-accent/20'
                          : 'ring-1 ring-white/[0.06] opacity-60',
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        size,
                        'rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110',
                        isOnline
                          ? 'bg-accent/15 ring-2 ring-accent/40 shadow-lg shadow-accent/20'
                          : 'bg-white/[0.04] ring-1 ring-white/[0.06] opacity-60',
                      )}
                    >
                      <PawPrint
                        size={isLarge ? 18 : 14}
                        className={isOnline ? 'text-accent' : 'text-text-muted/30'}
                      />
                    </div>
                  )}
                  {/* Status dot */}
                  <div
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-deep',
                      isOnline ? 'bg-success' : 'bg-text-muted/40',
                    )}
                  />
                  {/* Online glow */}
                  {isOnline && (
                    <div className="absolute inset-0 rounded-full bg-accent/10 blur-md -z-10 animate-pulse" />
                  )}
                </div>
                <span className="text-[9px] font-bold text-text-muted/50 group-hover:text-text-primary/80 truncate max-w-[60px] text-center transition-colors">
                  {m.user?.displayName ?? m.user?.username}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-[calc(100%-32px)]">
          <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-2">
            <PawPrint size={24} className="text-text-muted/15" />
          </div>
          <p className="text-[10px] text-text-muted/30">
            {t('serverHome.noBuddies', '还没有 Buddy 入驻')}
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Quick Actions — Floating action orbs instead of button list ── */
function QuickActionsContent({
  serverSlug,
  navigate,
  t,
}: {
  serverSlug: string
  navigate: ReturnType<typeof useNavigate>
  t: TranslateFn
}) {
  const actions = [
    {
      icon: MessageSquare,
      label: t('serverHome.actionChat', '聊天'),
      gradient: 'from-primary/20 to-primary/5',
      glow: 'shadow-primary/20',
      iconColor: 'text-primary',
      onClick: () => navigate({ to: '/servers/$serverSlug', params: { serverSlug } }),
    },
    {
      icon: ShoppingBag,
      label: t('serverHome.actionStore', '商店'),
      gradient: 'from-accent/20 to-accent/5',
      glow: 'shadow-accent/20',
      iconColor: 'text-accent',
      onClick: () => navigate({ to: '/servers/$serverSlug/shop', params: { serverSlug } }),
    },
    {
      icon: FileText,
      label: t('serverHome.actionWork', '工作区'),
      gradient: 'from-info/20 to-info/5',
      glow: 'shadow-info/20',
      iconColor: 'text-info',
      onClick: () => navigate({ to: '/servers/$serverSlug/workspace', params: { serverSlug } }),
    },
  ]

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        <Sparkles size={13} className="text-primary/50" />
        <span className="text-xs font-black text-text-primary/60 tracking-tight">
          {t('serverHome.widgetQuickActions', '快捷入口')}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {actions.map((action) => (
          <button
            type="button"
            key={action.label}
            onClick={action.onClick}
            className={cn(
              'group flex flex-col items-center gap-2 transition-all duration-300',
              'hover:scale-105 active:scale-95',
            )}
          >
            <div
              className={cn(
                'w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center',
                'shadow-lg transition-shadow duration-300 group-hover:shadow-xl',
                action.gradient,
                `group-hover:${action.glow}`,
              )}
            >
              <action.icon
                size={20}
                className={cn(
                  action.iconColor,
                  'opacity-80 group-hover:opacity-100 transition-opacity',
                )}
              />
            </div>
            <span className="text-[10px] font-bold text-text-muted/50 group-hover:text-text-primary/80 transition-colors">
              {action.label}
            </span>
            <ArrowRight
              size={10}
              className="text-text-muted/20 opacity-0 group-hover:opacity-100 -mt-1 transition-all"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Channel Overview — Ring chart + floating numbers ── */
function ChannelOverviewContent({
  channels,
  serverSlug,
  navigate,
  t,
}: {
  channels: ChannelInfo[]
  serverSlug: string
  navigate: ReturnType<typeof useNavigate>
  t: TranslateFn
}) {
  const textCount = channels.filter((ch) => ch.type === 'text').length
  const voiceCount = channels.filter((ch) => ch.type === 'voice').length
  const announceCount = channels.filter((ch) => ch.type === 'announcement').length
  const total = textCount + voiceCount + announceCount || 1

  /* SVG ring chart (donut) */
  const ringRadius = 36
  const circumference = 2 * Math.PI * ringRadius
  const textArc = (textCount / total) * circumference
  const voiceArc = (voiceCount / total) * circumference

  return (
    <button
      type="button"
      onClick={() => {
        const first = channels[0]
        if (first)
          navigate({
            to: '/servers/$serverSlug/channels/$channelId',
            params: { serverSlug, channelId: first.id },
          })
      }}
      className="flex items-center gap-5 group cursor-pointer w-full text-left"
    >
      {/* Ring chart */}
      <div className="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <title>{t('serverHome.widgetChannels', '频道')}</title>
          {/* Background ring */}
          <circle
            cx="40"
            cy="40"
            r={ringRadius}
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="5"
            opacity="0.06"
          />
          {/* Text channels arc */}
          <circle
            cx="40"
            cy="40"
            r={ringRadius}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="5"
            strokeDasharray={`${textArc} ${circumference - textArc}`}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
          {/* Voice channels arc */}
          <circle
            cx="40"
            cy="40"
            r={ringRadius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="5"
            strokeDasharray={`${voiceArc} ${circumference - voiceArc}`}
            strokeDashoffset={-textArc}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        {/* Center number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-black text-text-primary/80">{channels.length}</span>
          <span className="text-[8px] font-bold text-text-muted/40 uppercase tracking-widest">
            {t('serverHome.widgetChannels', '频道')}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="text-[11px] text-text-muted/60 flex-1">
            {t('serverHome.textChannels', '文字')}
          </span>
          <span className="text-sm font-black text-text-primary/70 tabular-nums">{textCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
          <span className="text-[11px] text-text-muted/60 flex-1">
            {t('serverHome.voiceChannels', '语音')}
          </span>
          <span className="text-sm font-black text-text-primary/70 tabular-nums">{voiceCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-info shrink-0" />
          <span className="text-[11px] text-text-muted/60 flex-1">
            {t('serverHome.announceChannels', '公告')}
          </span>
          <span className="text-sm font-black text-text-primary/70 tabular-nums">
            {announceCount}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight
        size={14}
        className="text-text-muted/20 group-hover:text-primary/60 shrink-0 transition-colors"
      />
    </button>
  )
}
