// ══════════════════════════════════════════════════════════════
// Card Kind Metadata — shared config for all card types
//
// Centralises labels, icons, and palette colours so every
// component (CardGrid, CardDetail, PhysicsDesk, OutlineEditor …)
// draws from a single source of truth.
// ══════════════════════════════════════════════════════════════

import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookMarked,
  BookOpen,
  Calendar,
  CheckSquare,
  Clock,
  Code,
  File,
  FileText,
  GitCompareArrows,
  Image,
  Lightbulb,
  Link,
  Link2,
  MapPin,
  MessageCircle,
  MessageSquare,
  Mic,
  Music,
  Palette,
  Share2,
  Sigma,
  Star,
  Table,
  Target,
  Video,
  Workflow,
  Zap,
} from 'lucide-react'
import type { CardKind } from '../types'

// ─────────────────────────────────────
// CARD_KIND_META
// ─────────────────────────────────────

export const CARD_KIND_META: Record<
  CardKind,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  quote: { label: 'Quote', icon: MessageSquare, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  summary: { label: 'Summary', icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  argument: { label: 'Argument', icon: Target, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  data: { label: 'Data', icon: BarChart3, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  table: { label: 'Table', icon: Table, color: 'text-teal-400', bg: 'bg-teal-500/10' },
  image: { label: 'Image', icon: Image, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  code: { label: 'Code', icon: Code, color: 'text-lime-400', bg: 'bg-lime-500/10' },
  chart: { label: 'Chart', icon: BarChart3, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  idea: { label: 'Idea', icon: Lightbulb, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  text: { label: 'Text', icon: FileText, color: 'text-slate-400', bg: 'bg-slate-500/10' },
  audio: { label: 'Audio', icon: Music, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  video: { label: 'Video', icon: Video, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  keypoint: { label: 'Key Point', icon: Star, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  definition: {
    label: 'Definition',
    icon: BookOpen,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  example: { label: 'Example', icon: FileText, color: 'text-sky-400', bg: 'bg-sky-500/10' },
  reference: { label: 'Reference', icon: Link2, color: 'text-gray-400', bg: 'bg-gray-500/10' },
  inspiration: {
    label: 'Inspiration',
    icon: Zap,
    color: 'text-fuchsia-400',
    bg: 'bg-fuchsia-500/10',
  },
  timeline: { label: 'Timeline', icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  comparison: {
    label: 'Comparison',
    icon: GitCompareArrows,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
  process: { label: 'Process', icon: Workflow, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  link: { label: 'Link', icon: Link, color: 'text-sky-400', bg: 'bg-sky-500/10' },
  file: { label: 'File', icon: File, color: 'text-slate-400', bg: 'bg-slate-500/10' },
  math: { label: 'Formula', icon: Sigma, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  todo: { label: 'Todo', icon: CheckSquare, color: 'text-green-400', bg: 'bg-green-500/10' },
  position: { label: 'Position', icon: MapPin, color: 'text-red-400', bg: 'bg-red-500/10' },
  timestamp: { label: 'Timestamp', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  color: { label: 'Color', icon: Palette, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  event: { label: 'Event', icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  voice: { label: 'Voice', icon: Mic, color: 'text-teal-400', bg: 'bg-teal-500/10' },
  comment: {
    label: 'Comment',
    icon: MessageCircle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
  },
  story: { label: 'Story', icon: BookMarked, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  social: { label: 'Social', icon: Share2, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10' },
}

/** Card types that require a file upload. */
export const FILE_CARD_KINDS: CardKind[] = ['image', 'audio', 'video']

/** All known card kinds, in the order they appear in the palette. */
export const ALL_KINDS: CardKind[] = Object.keys(CARD_KIND_META) as CardKind[]
