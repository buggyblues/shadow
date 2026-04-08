/* ─────────────────────────────────────────────────────────────────────────────
 *  Shadow OS — Built-in Widget Manifests
 *
 *  Registers the default widgets that ship with every server home canvas.
 *  These are native React widgets rendered in-process (renderMode: 'react').
 *
 *  Design: Every built-in widget is borderless & transparent by default.
 *  Content "floats" directly on the canvas — no card shells.
 * ───────────────────────────────────────────────────────────────────────────── */

import type { WidgetManifest } from './types'

export const BUILTIN_WIDGETS: WidgetManifest[] = [
  {
    id: 'builtin:hero-banner',
    name: 'widget.builtinHero',
    description: 'widget.builtinHeroDesc',
    icon: 'Sparkles',
    renderMode: 'react',
    permissions: [],
    appearance: { borderless: true, transparent: true, radius: null },
    defaultRect: { x: 60, y: 40, w: 860, h: 140 },
    tags: ['identity'],
    previewGradient: 'from-primary/30 via-accent/20 to-primary/10',
  },
  {
    id: 'builtin:activity-feed',
    name: 'widget.builtinActivity',
    description: 'widget.builtinActivityDesc',
    icon: 'TrendingUp',
    renderMode: 'react',
    permissions: [],
    appearance: { borderless: false, transparent: false, radius: 24 },
    defaultRect: { x: 60, y: 220, w: 420, h: 320 },
    tags: ['production'],
    previewGradient: 'from-primary/20 to-info/10',
  },
  {
    id: 'builtin:buddy-roster',
    name: 'widget.builtinBuddies',
    description: 'widget.builtinBuddiesDesc',
    icon: 'PawPrint',
    renderMode: 'react',
    permissions: ['buddy.subscribe'],
    appearance: { borderless: true, transparent: true, radius: null },
    defaultRect: { x: 510, y: 220, w: 410, h: 320 },
    tags: ['buddy'],
    previewGradient: 'from-accent/30 to-warning/10',
  },
  {
    id: 'builtin:quick-actions',
    name: 'widget.builtinActions',
    description: 'widget.builtinActionsDesc',
    icon: 'Zap',
    renderMode: 'react',
    permissions: [],
    appearance: { borderless: true, transparent: true, radius: null },
    defaultRect: { x: 60, y: 570, w: 420, h: 200 },
    tags: ['automation'],
    previewGradient: 'from-warning/20 to-primary/10',
  },
  {
    id: 'builtin:channel-overview',
    name: 'widget.builtinChannels',
    description: 'widget.builtinChannelsDesc',
    icon: 'Hash',
    renderMode: 'react',
    permissions: [],
    appearance: { borderless: true, transparent: true, radius: null },
    defaultRect: { x: 510, y: 570, w: 410, h: 200 },
    tags: ['production'],
    previewGradient: 'from-info/20 to-primary/10',
  },
]

/** Get a builtin manifest by ID */
export function getBuiltinManifest(id: string): WidgetManifest | undefined {
  return BUILTIN_WIDGETS.find((m) => m.id === id)
}
