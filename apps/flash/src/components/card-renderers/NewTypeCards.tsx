// React card renderers for Link, File, Math (KaTeX), Todo, and 8 new card types

import {
  BookMarked,
  Calendar,
  CheckSquare,
  ExternalLink,
  File,
  MapPin,
  MessageCircle,
  Mic,
  Palette,
  Share2,
  Square,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import type {
  ColorCardMeta,
  CommentCardMeta,
  EventCardMeta,
  FileCardMeta,
  LinkCardMeta,
  MathCardMeta,
  PositionCardMeta,
  SocialCardMeta,
  StoryCardMeta,
  TimestampCardMeta,
  TodoCardMeta,
  VoiceCardMeta,
} from '../../types'

// ─────────────────────────────────────
// LinkCard
// ─────────────────────────────────────

export function LinkCard({ meta }: { meta: LinkCardMeta }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <ExternalLink className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <div className="min-w-0 flex-1">
          {meta.title && (
            <p className="text-[13px] font-semibold text-sky-300 leading-tight">{meta.title}</p>
          )}
          {meta.source && (
            <span className="inline-block rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] text-sky-400/70 mt-0.5">
              {meta.source}
            </span>
          )}
        </div>
      </div>
      {meta.description && (
        <p className="text-[11px] text-zinc-400 leading-relaxed">{meta.description}</p>
      )}
      <a
        href={meta.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-[10px] text-sky-500/70 hover:text-sky-400 truncate font-mono transition-colors"
      >
        {meta.url}
      </a>
      {meta.tags && meta.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {meta.tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[9px] text-zinc-500"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// FileCard
// ─────────────────────────────────────

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: 'text-red-400 bg-red-500/10',
  doc: 'text-blue-400 bg-blue-500/10',
  docx: 'text-blue-400 bg-blue-500/10',
  xls: 'text-green-400 bg-green-500/10',
  xlsx: 'text-green-400 bg-green-500/10',
  csv: 'text-green-400 bg-green-500/10',
  zip: 'text-amber-400 bg-amber-500/10',
  tar: 'text-amber-400 bg-amber-500/10',
  mp4: 'text-purple-400 bg-purple-500/10',
  mp3: 'text-cyan-400 bg-cyan-500/10',
  png: 'text-pink-400 bg-pink-500/10',
  jpg: 'text-pink-400 bg-pink-500/10',
  ts: 'text-blue-400 bg-blue-500/10',
  js: 'text-yellow-400 bg-yellow-500/10',
  py: 'text-green-400 bg-green-500/10',
  json: 'text-emerald-400 bg-emerald-500/10',
  md: 'text-violet-400 bg-violet-500/10',
}

function getExt(filename: string, type?: string): string {
  return (type || filename.split('.').pop() || 'file').toLowerCase()
}

export function FileCard({ meta }: { meta: FileCardMeta }) {
  const ext = getExt(meta.filename, meta.type)
  const colorClass = FILE_TYPE_COLORS[ext] || 'text-slate-400 bg-slate-500/10'

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-10 w-8 shrink-0 items-center justify-center rounded-md text-[9px] font-bold uppercase ${colorClass}`}
        >
          {ext.slice(0, 4)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-zinc-200 leading-tight truncate">
            {meta.filename}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
            {meta.size && <span>{meta.size}</span>}
            {meta.type && <span className="uppercase">{meta.type}</span>}
          </div>
        </div>
      </div>

      {meta.path && <p className="text-[9px] font-mono text-zinc-600 truncate">{meta.path}</p>}
      {meta.description && (
        <p className="text-[11px] text-zinc-400 leading-relaxed">{meta.description}</p>
      )}
      {meta.modified && (
        <p className="text-[9px] text-zinc-600">
          Modified {new Date(meta.modified).toLocaleDateString('en-US')}
        </p>
      )}
      {meta.url && (
        <a
          href={meta.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-sky-500/70 hover:text-sky-400"
        >
          <ExternalLink className="h-3 w-3" />
          Download
        </a>
      )}
      {meta.tags && meta.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.tags.map((t, i) => (
            <span key={i} className={`rounded-full px-1.5 py-0.5 text-[9px] ${colorClass}`}>
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// MathCard — KaTeX rendering
// ─────────────────────────────────────

function KatexFormula({ formula, displayMode = true }: { formula: string; displayMode?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    import('katex').then(({ default: katex }) => {
      if (!ref.current) return
      try {
        katex.render(formula, ref.current, {
          throwOnError: false,
          displayMode,
          output: 'html',
        })
      } catch {
        if (ref.current) ref.current.textContent = formula
      }
    })
  }, [formula, displayMode])

  return (
    <div
      ref={ref}
      className="katex-formula text-center py-1"
      style={{ color: 'var(--color-zinc-200, #e4e4e7)' }}
    />
  )
}

export function MathCard({ meta }: { meta: MathCardMeta }) {
  return (
    <div className="space-y-3">
      {(meta.name || meta.category) && (
        <div className="flex items-center gap-2">
          {meta.name && (
            <span className="text-[12px] font-semibold text-violet-300">{meta.name}</span>
          )}
          {meta.category && (
            <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[9px] text-violet-400/70">
              {meta.category}
            </span>
          )}
        </div>
      )}

      <div className="rounded-lg bg-zinc-900/80 border border-violet-500/20 px-4 py-3">
        <KatexFormula formula={meta.formula} displayMode={true} />
      </div>

      {meta.steps && meta.steps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-600">Derivation Steps</p>
          {meta.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              {step.label && (
                <span className="shrink-0 text-[9px] text-zinc-500 mt-1">{step.label}</span>
              )}
              <div className="flex-1 rounded-md bg-zinc-900/50 border border-zinc-800 px-2 py-1">
                <KatexFormula formula={step.formula} displayMode={false} />
              </div>
            </div>
          ))}
        </div>
      )}

      {meta.description && (
        <p className="text-[11px] text-zinc-400 leading-relaxed italic">{meta.description}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// TodoCard
// ─────────────────────────────────────

const PRIORITY_COLORS = {
  high: 'text-red-400',
  medium: 'text-amber-400',
  low: 'text-zinc-500',
}

export function TodoCard({ meta }: { meta: TodoCardMeta }) {
  const items = meta.items || []
  const doneCount = items.filter((it) => it.done).length
  const total = items.length
  const progress = total > 0 ? doneCount / total : 0

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[9px] text-zinc-500">
          {meta.progress || `${doneCount}/${total}`}
        </span>
      </div>

      {/* Items */}
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {item.done ? (
              <CheckSquare className="h-3.5 w-3.5 shrink-0 text-green-400 mt-0.5" />
            ) : (
              <Square className="h-3.5 w-3.5 shrink-0 text-zinc-600 mt-0.5" />
            )}
            {item.priority && (
              <span
                className={`shrink-0 mt-0.5 ${PRIORITY_COLORS[item.priority] || 'text-zinc-500'}`}
              >
                ●
              </span>
            )}
            <span
              className={`flex-1 text-[11px] leading-relaxed ${item.done ? 'line-through text-zinc-600' : 'text-zinc-300'}`}
            >
              {item.text}
            </span>
            {item.tag && (
              <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[8px] text-zinc-500">
                #{item.tag}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────
// PositionCard
// ─────────────────────────────────────
export function PositionCard({ meta }: { meta: PositionCardMeta }) {
  return (
    <div className="space-y-2">
      {/* Map placeholder */}
      <div
        className="relative w-full rounded-lg overflow-hidden"
        style={{ height: 100, background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}
      >
        {/* Grid */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-3 gap-0">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="border border-red-400/10" />
          ))}
        </div>
        {/* Pin */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <div className="rounded-full bg-red-400 p-1.5 shadow-lg shadow-red-400/40">
              <MapPin className="h-3 w-3 text-white" />
            </div>
            <div className="h-2 w-0.5 bg-red-400/60" />
            <div className="h-1 w-2 rounded-full bg-red-400/20" />
          </div>
        </div>
        {/* Provider */}
        <span className="absolute bottom-1 right-2 text-[9px] text-zinc-500">
          {meta.provider === 'amap' ? 'Amap' : meta.provider === 'google' ? 'Google' : 'OSM'}
        </span>
      </div>

      {meta.name && <p className="text-[12px] font-semibold text-red-300">{meta.name}</p>}
      {meta.address && <p className="text-[11px] text-zinc-400 leading-relaxed">{meta.address}</p>}
      <p className="font-mono text-[10px] text-zinc-600">
        {meta.lat.toFixed(6)}, {meta.lng.toFixed(6)}
      </p>
      {meta.note && <p className="text-[10px] text-zinc-500 italic">{meta.note}</p>}
    </div>
  )
}

// ─────────────────────────────────────
// TimestampCard
// ─────────────────────────────────────
function formatTs(isoStr: string, precision = 'minute'): { primary: string; secondary: string } {
  try {
    const d = new Date(isoStr)
    if (isNaN(d.getTime())) return { primary: isoStr, secondary: '' }
    const pad = (n: number) => String(n).padStart(2, '0')
    const year = d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const h = pad(d.getHours())
    const m = pad(d.getMinutes())
    const s = pad(d.getSeconds())
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const weekDay = weekDays[d.getDay()]
    if (precision === 'year') return { primary: `${year}`, secondary: '' }
    if (precision === 'month') return { primary: `${year}-${month}`, secondary: '' }
    if (precision === 'day') return { primary: `${year}-${month}-${day}`, secondary: weekDay }
    if (precision === 'hour')
      return { primary: `${year}/${month}/${day}  ${h}:00`, secondary: weekDay }
    if (precision === 'second')
      return { primary: `${year}/${month}/${day}\n${h}:${m}:${s}`, secondary: weekDay }
    return { primary: `${year}/${month}/${day}  ${h}:${m}`, secondary: weekDay }
  } catch {
    return { primary: isoStr, secondary: '' }
  }
}

export function TimestampCard({ meta }: { meta: TimestampCardMeta }) {
  const { primary, secondary } = formatTs(meta.datetime, meta.precision)
  return (
    <div className="space-y-1 text-center">
      <p className="text-[22px] font-bold text-amber-300 leading-tight whitespace-pre-line">
        {primary}
      </p>
      {secondary && <p className="text-[10px] text-zinc-400">{secondary}</p>}
      {meta.label && <p className="text-[11px] text-zinc-300 mt-1">{meta.label}</p>}
      {meta.timezone && <p className="text-[9px] font-mono text-zinc-600">{meta.timezone}</p>}
      {meta.note && <p className="text-[10px] text-zinc-500 italic mt-1">{meta.note}</p>}
    </div>
  )
}

// ─────────────────────────────────────
// ColorCard
// ─────────────────────────────────────
function isLightColor(hex: string): boolean {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return false
  return (
    (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 > 128
  )
}

export function ColorCard({ meta }: { meta: ColorCardMeta }) {
  const textColor = isLightColor(meta.hex) ? 'text-black/60' : 'text-white/90'
  const rgb = meta.rgb
  const hsl = meta.hsl
  return (
    <div className="space-y-2">
      {/* Main swatch */}
      <div
        className="relative w-full rounded-lg flex items-center justify-center"
        style={{ backgroundColor: meta.hex, height: 72 }}
      >
        <span className={`font-mono text-[14px] font-bold ${textColor}`}>
          {meta.hex.toUpperCase()}
        </span>
      </div>

      {meta.name && (
        <p className="text-[12px] font-semibold" style={{ color: meta.hex }}>
          {meta.name}
        </p>
      )}
      {rgb && (
        <p className="font-mono text-[10px] text-zinc-400">
          R{rgb.r} G{rgb.g} B{rgb.b}
        </p>
      )}
      {hsl && (
        <p className="font-mono text-[10px] text-zinc-500">
          H{hsl.h}° S{hsl.s}% L{hsl.l}%
        </p>
      )}

      {meta.palette && meta.palette.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {meta.palette.slice(0, 8).map((chip, i) => (
            <div
              key={i}
              className="h-5 w-5 rounded-sm shadow-sm"
              style={{ backgroundColor: chip.hex }}
              title={chip.name || chip.hex}
            />
          ))}
        </div>
      )}

      {(meta.usage || meta.system) && (
        <p className="text-[10px] text-zinc-500">{meta.usage || meta.system}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// EventCard
// ─────────────────────────────────────
function fmtEventTime(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}/${d.getDate()}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

export function EventCard({ meta }: { meta: EventCardMeta }) {
  const timeStr = meta.allDay
    ? 'All Day'
    : meta.endAt
      ? `${fmtEventTime(meta.startAt)} → ${fmtEventTime(meta.endAt)}`
      : fmtEventTime(meta.startAt)

  return (
    <div className="space-y-2">
      {/* Title with dot */}
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: meta.color || '#60a5fa' }}
        />
        <p className="text-[12px] font-bold text-blue-300 leading-tight">{meta.title}</p>
      </div>

      {/* Time */}
      <div className="rounded-md bg-blue-500/8 border border-blue-500/20 px-3 py-1.5 text-center">
        <p className="font-mono text-[10px] text-blue-200">{timeStr}</p>
      </div>

      {/* Location */}
      {meta.location && (
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <MapPin className="h-3 w-3 text-blue-400/60 shrink-0" />
          {meta.location}
        </div>
      )}

      {/* Attendees */}
      {meta.attendees && meta.attendees.length > 0 && (
        <div className="flex items-center gap-1">
          {meta.attendees.slice(0, 5).map((a, i) => (
            <div
              key={i}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[8px] font-bold text-blue-300"
            >
              {a.name.charAt(0)}
            </div>
          ))}
          {meta.attendees.length > 5 && (
            <span className="text-[9px] text-zinc-500">+{meta.attendees.length - 5}</span>
          )}
        </div>
      )}

      {/* Recurrence */}
      {meta.recurrence && (
        <p className="text-[9px] text-zinc-500">
          ↺{' '}
          {{
            daily: 'Daily',
            weekly: 'Weekly',
            monthly: 'Monthly',
            yearly: 'Yearly',
            custom: 'Custom',
          }[meta.recurrence] || meta.recurrence}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// VoiceCard
// ─────────────────────────────────────
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function VoiceCard({ meta }: { meta: VoiceCardMeta }) {
  const bars = 32
  return (
    <div className="space-y-2">
      {/* Waveform */}
      <div className="relative flex items-center justify-between gap-0.5 rounded-lg bg-teal-500/8 border border-teal-500/15 px-3 py-3">
        {Array.from({ length: bars }).map((_, i) => {
          const amp = meta.waveform
            ? (meta.waveform[Math.floor((i / bars) * meta.waveform.length)] ?? 0.5)
            : 0.2 + 0.8 * Math.abs(Math.sin(i * 1.3 + 2) * Math.cos(i * 0.7))
          return (
            <div
              key={i}
              className="rounded-full bg-teal-400"
              style={{ width: 2, height: Math.max(3, amp * 24), opacity: 0.5 + amp * 0.5 }}
            />
          )
        })}
        {meta.duration != null && (
          <span className="absolute right-2 top-1 font-mono text-[9px] text-teal-500">
            {fmtDuration(meta.duration)}
          </span>
        )}
      </div>

      {/* Transcript */}
      {(meta.transcript || meta.summary) && (
        <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-3">
          {meta.transcript || meta.summary}
        </p>
      )}

      {/* Tags */}
      {meta.tags && meta.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.tags.slice(0, 4).map((tag, i) => (
            <span
              key={i}
              className="rounded-full bg-teal-500/10 px-1.5 py-0.5 text-[9px] text-teal-400/70"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// CommentCard
// ─────────────────────────────────────
export function CommentCard({ meta }: { meta: CommentCardMeta }) {
  return (
    <div className="space-y-2">
      {/* Author */}
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-[10px] font-bold text-orange-300">
          {(meta.author?.name ?? '?').charAt(0)}
        </div>
        <span className="text-[11px] font-semibold text-orange-300">
          {meta.author?.name ?? 'Anonymous'}
        </span>
        {meta.resolved && <span className="ml-auto text-[9px] text-green-400">✓ Resolved</span>}
      </div>

      {/* Content bubble */}
      <div className="rounded-lg bg-orange-500/6 border border-orange-500/15 px-3 py-2">
        <p className="text-[11px] text-zinc-200 leading-relaxed">{meta.content}</p>
      </div>

      {/* Reactions */}
      {meta.reactions && meta.reactions.length > 0 && (
        <div className="flex gap-1.5">
          {meta.reactions.slice(0, 5).map((r, i) => (
            <span key={i} className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px]">
              {r.emoji}
              {r.count}
            </span>
          ))}
        </div>
      )}

      {/* Replies */}
      {meta.replies && meta.replies.length > 0 && (
        <div className="border-l-2 border-orange-400/25 pl-2 space-y-1">
          {meta.replies.slice(0, 2).map((r, i) => (
            <p key={i} className="text-[10px] text-zinc-400">
              <span className="font-medium text-zinc-300">{r.author}: </span>
              {r.content}
            </p>
          ))}
          {meta.replies.length > 2 && (
            <p className="text-[9px] text-zinc-600">+{meta.replies.length - 2} more replies</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// StoryCard
// ─────────────────────────────────────
export function StoryCard({ meta }: { meta: StoryCardMeta }) {
  return (
    <div className="space-y-2">
      {/* Title */}
      <p className="text-[13px] font-bold text-indigo-200 leading-snug font-serif">{meta.title}</p>
      {meta.subtitle && <p className="text-[11px] text-zinc-400 italic">{meta.subtitle}</p>}

      {/* Meta row */}
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        {meta.author && <span>{meta.author}</span>}
        {meta.readingTime && <span>· {meta.readingTime} min read</span>}
      </div>

      <div className="h-px w-1/3 bg-indigo-400/20" />

      {/* Body excerpt */}
      {meta.body && (
        <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-4 font-serif">
          {meta.body}
        </p>
      )}

      {/* Chapters */}
      {meta.chapters && meta.chapters.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {meta.chapters.slice(0, 3).map((ch, i) => (
            <p key={i} className="text-[10px] text-zinc-500">
              {i + 1}. {ch.title}
            </p>
          ))}
          {meta.chapters.length > 3 && (
            <p className="text-[9px] text-zinc-600">…{meta.chapters.length} chapters total</p>
          )}
        </div>
      )}

      {/* Tags */}
      {meta.tags && meta.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.tags.slice(0, 4).map((tag, i) => (
            <span
              key={i}
              className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-400/70"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// SocialCard
// ─────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1d9bf0',
  weibo: '#e6162d',
  linkedin: '#0077b5',
  instagram: '#e1306c',
  tiktok: '#888',
  youtube: '#ff0000',
  other: '#a78bfa',
}
const PLATFORM_LABELS: Record<string, string> = {
  twitter: 'X / Twitter',
  weibo: 'Weibo',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  other: 'Social',
}

export function SocialCard({ meta }: { meta: SocialCardMeta }) {
  const pColor = PLATFORM_COLORS[meta.platform] || '#a78bfa'
  return (
    <div className="space-y-2">
      {/* Platform badge */}
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold"
        style={{ background: `${pColor}22`, color: pColor }}
      >
        {PLATFORM_LABELS[meta.platform] || meta.platform}
      </span>

      {/* Author */}
      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: `${pColor}33`, color: pColor }}
        >
          {meta.author.name.charAt(0)}
        </div>
        <div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-zinc-200">{meta.author.name}</span>
            {meta.author.verified && (
              <span className="text-[9px]" style={{ color: pColor }}>
                ✓
              </span>
            )}
          </div>
          {meta.author.handle && (
            <p className="font-mono text-[9px] text-zinc-500">{meta.author.handle}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <p className="text-[11px] text-zinc-200 leading-relaxed line-clamp-4">{meta.content}</p>

      {/* Hashtags */}
      {meta.hashtags && meta.hashtags.length > 0 && (
        <p className="text-[10px]" style={{ color: pColor }}>
          {meta.hashtags
            .slice(0, 4)
            .map((h) => `#${h}`)
            .join(' ')}
        </p>
      )}

      {/* Stats */}
      {meta.stats && (
        <div className="flex gap-3 text-[10px] text-zinc-500">
          {meta.stats.likes != null && <span>♥ {meta.stats.likes}</span>}
          {meta.stats.reposts != null && <span>↺ {meta.stats.reposts}</span>}
          {meta.stats.comments != null && <span>💬 {meta.stats.comments}</span>}
          {meta.stats.views != null && <span>👁 {meta.stats.views}</span>}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// PositionCard
// ─────────────────────────────────────
