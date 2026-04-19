import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  Flag,
  GripVertical,
  Image,
  Layout,
  LayoutGrid,
  Link2,
  List,
  type LucideIcon,
  Plus,
  Quote,
  SlidersHorizontal,
  Trash2,
  Type,
  Unlink2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { genId } from '../api'
import { CARD_KIND_META } from '../constants/cardKind'
import { getActiveDeck, useApp } from '../store'
import type { Card, Deck, OutlineItem } from '../types'
import { StarRating } from './StarRating'
import StoryboardConfig from './StoryboardConfig'

const SLIDE_TYPE_META: Record<
  OutlineItem['type'],
  { label: string; icon: LucideIcon; color: string; bg: string; preview: string }
> = {
  cover: {
    label: 'Cover',
    icon: Layout,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    preview: 'from-purple-900/40 to-purple-800/20',
  },
  toc: {
    label: 'TOC',
    icon: List,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    preview: 'from-blue-900/40 to-blue-800/20',
  },
  section: {
    label: 'Section',
    icon: Type,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    preview: 'from-cyan-900/40 to-cyan-800/20',
  },
  content: {
    label: 'Content',
    icon: FileText,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    preview: 'from-green-900/40 to-green-800/20',
  },
  chart: {
    label: 'Chart',
    icon: BarChart3,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    preview: 'from-yellow-900/40 to-yellow-800/20',
  },
  image: {
    label: 'Image',
    icon: Image,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    preview: 'from-indigo-900/40 to-indigo-800/20',
  },
  quote: {
    label: 'Quote',
    icon: Quote,
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    preview: 'from-pink-900/40 to-pink-800/20',
  },
  ending: {
    label: 'Ending',
    icon: Flag,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    preview: 'from-rose-900/40 to-rose-800/20',
  },
}

interface OutlineEditorProps {
  onRequestLinkCard?: (deckId: string, outlineId: string) => void
}

/** Add Slide button */
function AddSlideInline({ onAdd }: { onAdd: (type: OutlineItem['type']) => void }) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  return (
    <div className="relative flex items-center justify-center py-1 group">
      <div className="absolute inset-x-4 top-1/2 h-px bg-border/30 opacity-0 group-hover:opacity-100 transition" />
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="relative z-10 flex items-center gap-1 rounded-full border border-border/40 bg-surface-2 px-2.5 py-0.5 text-[10px] text-zinc-600 transition hover:border-brand-500/30 hover:text-brand-400 hover:bg-brand-500/5 opacity-0 group-hover:opacity-100"
      >
        <Plus className="h-2.5 w-2.5" />
        Add
      </button>
      {showMenu && (
        <div
          ref={menuRef}
          className="animate-fade-in absolute left-1/2 top-full z-20 -translate-x-1/2 mt-1 rounded-xl border border-border bg-surface-2 p-2 shadow-xl"
        >
          <div className="grid grid-cols-4 gap-1">
            {Object.entries(SLIDE_TYPE_META).map(([key, meta]) => {
              const Icon = meta.icon
              return (
                <button
                  key={key}
                  onClick={() => {
                    onAdd(key as OutlineItem['type'])
                    setShowMenu(false)
                  }}
                  className="flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition hover:bg-surface-hover"
                >
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                  <span className="text-[9px] text-zinc-500">{meta.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OutlineEditor({ onRequestLinkCard }: OutlineEditorProps) {
  const { state, dispatch } = useApp()
  const deck = getActiveDeck(state.project)
  const outline = deck?.outline || []
  const deckId = deck?.id || ''
  const allCards = state.project.cards
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list')

  const addSlide = (type: OutlineItem['type'] = 'content', atIndex?: number) => {
    if (!deckId) return
    const insertAt = atIndex !== undefined ? atIndex : outline.length
    const newItem: OutlineItem = {
      id: genId(),
      slideIndex: insertAt,
      title: '',
      type,
      keyPoints: [],
      materialRefs: [],
      cardRefs: [],
    }
    const newOutline = [...outline]
    newOutline.splice(insertAt, 0, newItem)
    dispatch({
      type: 'SET_OUTLINE',
      deckId,
      outline: newOutline.map((o, i) => ({ ...o, slideIndex: i })),
    })
    setExpandedId(newItem.id)
  }

  const removeSlide = (id: string) => {
    if (!deckId) return
    dispatch({ type: 'REMOVE_OUTLINE_ITEM', deckId, id })
  }

  // Drag-and-drop reordering
  const handleDragStart = (id: string) => setDragId(id)
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('application/card-id')) {
      e.dataTransfer.dropEffect = 'link'
      setDragOverId(targetId)
      return
    }
    if (dragId && dragId !== targetId) setDragOverId(targetId)
  }
  const handleDragLeave = () => setDragOverId(null)
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    if (!deckId) return
    const cardId = e.dataTransfer.getData('application/card-id')
    if (cardId) {
      dispatch({ type: 'LINK_CARD_TO_OUTLINE', deckId, outlineId: targetId, cardId })
      dispatch({ type: 'ADD_LOG', message: `Card linked to outline` })
      setDragOverId(null)
      return
    }
    if (!dragId || dragId === targetId) return
    const fromIdx = outline.findIndex((o) => o.id === dragId)
    const toIdx = outline.findIndex((o) => o.id === targetId)
    if (fromIdx >= 0 && toIdx >= 0) {
      dispatch({ type: 'REORDER_OUTLINE', deckId, fromIndex: fromIdx, toIndex: toIdx })
    }
    setDragId(null)
    setDragOverId(null)
  }
  const handleDragEnd = () => {
    setDragId(null)
    setDragOverId(null)
  }

  const getCards = (item: OutlineItem): Card[] => {
    return (item.cardRefs || [])
      .map((cid) => allCards.find((c) => c.id === cid))
      .filter(Boolean) as Card[]
  }

  if (!deck) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <List className="h-10 w-10 text-zinc-700" />
        <p className="text-sm text-zinc-500">Please select or create a presentation first</p>
      </div>
    )
  }

  if (outline.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="flex flex-col items-center gap-4 max-w-sm">
          <div className="rounded-2xl bg-gradient-to-br from-brand-600/10 to-purple-600/10 p-6 border border-brand-500/10">
            <Layout className="h-12 w-12 text-brand-400/50" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-zinc-300">Start arranging {deck.title}</h3>
            <p className="mt-1.5 text-xs text-zinc-600">
              Upload materials for AI auto-completion, or manually add slides
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] px-4 py-2.5 rounded-xl bg-surface-2/50 border border-border/30">
            <span className="text-emerald-400">📄 Materials</span>
            <span className="text-zinc-700">→</span>
            <span className="text-brand-400">🃏 Cards</span>
            <span className="text-zinc-700">→</span>
            <span className="text-cyan-400">📝 Outline</span>
            <span className="text-zinc-700">→</span>
            <span className="text-amber-400">📊 PPT</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 w-full mt-2">
            {Object.entries(SLIDE_TYPE_META).map(([key, meta]) => {
              const Icon = meta.icon
              return (
                <button
                  key={key}
                  onClick={() => addSlide(key as OutlineItem['type'])}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border/40 bg-surface-card px-3 py-2.5 transition hover:border-brand-500/30 hover:bg-surface-hover group"
                >
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300">
                    {meta.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* ═══ Outline Editor (full width) ═══ */}
      <div className="flex-1 overflow-y-auto">
        {/* Title bar + view toggle + config button */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/40 bg-surface/95 backdrop-blur-sm px-5 py-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-300">{deck.title}</h2>
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] text-zinc-500">
              {outline.length} pages
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border/40 bg-surface-2/50 p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition ${
                  viewMode === 'list'
                    ? 'bg-surface-3 text-zinc-200 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
                title="List view"
              >
                <List className="h-3 w-3" />
                List
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition ${
                  viewMode === 'card'
                    ? 'bg-surface-3 text-zinc-200 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-400'
                }`}
                title="Card view"
              >
                <LayoutGrid className="h-3 w-3" />
                Cards
              </button>
            </div>

            {/* Settings button */}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition ${
                showConfig
                  ? 'bg-brand-500/10 text-brand-300 border border-brand-500/30'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-3 border border-transparent'
              }`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Config
            </button>
          </div>
        </div>

        {/* Config panel (collapsible) */}
        {showConfig && (
          <div className="animate-fade-in border-b border-border/30 px-5 py-3 bg-surface-2/30">
            <StoryboardConfig />
          </div>
        )}

        {/* ═══ List view ═══ */}
        {viewMode === 'list' && (
          <div className="px-5 py-3 space-y-0">
            <AddSlideInline onAdd={(type) => addSlide(type, 0)} />

            {outline.map((item, index) => {
              const meta = SLIDE_TYPE_META[item.type] || SLIDE_TYPE_META.content
              const Icon = meta.icon
              const isExpanded = expandedId === item.id
              const linkedCards = getCards(item)
              const isDragging = dragId === item.id
              const isDragOver = dragOverId === item.id

              return (
                <div key={item.id}>
                  <div
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, item.id)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-xl border transition-all ${
                      isDragging
                        ? 'border-brand-500/30 opacity-40'
                        : isDragOver
                          ? 'border-brand-400/60 bg-brand-500/5 shadow-lg shadow-brand-500/5'
                          : item.isStreaming
                            ? 'animate-streaming border-brand-400/30 bg-brand-500/5'
                            : isExpanded
                              ? 'border-border bg-surface-card shadow-sm'
                              : 'border-border/40 hover:border-border hover:bg-surface-card/50'
                    }`}
                  >
                    {/* ── Row header ── */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-zinc-700 hover:text-zinc-500" />

                      {/* Slide number badge */}
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${meta.bg}`}
                      >
                        <span className="text-[10px] font-bold tabular-nums text-zinc-300">
                          {(typeof item.slideIndex === 'number' && !isNaN(item.slideIndex)
                            ? item.slideIndex
                            : index) + 1}
                        </span>
                      </div>

                      {/* Type icon */}
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />

                      {/* Title input */}
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_OUTLINE_ITEM',
                            deckId,
                            id: item.id,
                            updates: { title: e.target.value },
                          })
                        }
                        placeholder="Slide title..."
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-700 focus:outline-none"
                      />

                      {/* Linked cards indicator */}
                      {linkedCards.length > 0 && (
                        <span
                          className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${meta.bg} ${meta.color}`}
                        >
                          <Link2 className="h-2 w-2" />
                          {linkedCards.length}
                        </span>
                      )}

                      {/* Type selector */}
                      <select
                        value={item.type}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_OUTLINE_ITEM',
                            deckId,
                            id: item.id,
                            updates: { type: e.target.value as OutlineItem['type'] },
                          })
                        }
                        className="rounded-md bg-surface-3/60 px-1.5 py-0.5 text-[10px] text-zinc-500 focus:outline-none border border-transparent hover:border-border/50"
                      >
                        {Object.entries(SLIDE_TYPE_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>

                      {/* Expand/Collapse */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="rounded-md p-1 text-zinc-600 hover:text-zinc-400 hover:bg-surface-3/50"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => removeSlide(item.id)}
                        className="rounded-md p-1 text-zinc-700 hover:text-red-400 hover:bg-red-500/5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* ── Expanded detail ── */}
                    {isExpanded && (
                      <div className="animate-fade-in border-t border-border/30 px-4 py-3 space-y-4">
                        {/* Key points editor */}
                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                            Key Points
                          </label>
                          <textarea
                            value={item.keyPoints.join('\n')}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_OUTLINE_ITEM',
                                deckId,
                                id: item.id,
                                updates: {
                                  keyPoints: e.target.value.split('\n').filter((l) => l.trim()),
                                },
                              })
                            }
                            placeholder="One key point per line..."
                            rows={3}
                            className="w-full rounded-lg border border-border/40 bg-surface/50 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-brand-500/30 focus:outline-none resize-none"
                          />
                        </div>

                        {/* Linked cards */}
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                              <Link2 className="h-2.5 w-2.5" />
                              Linked Cards
                            </label>
                            <button
                              onClick={() => onRequestLinkCard?.(deckId, item.id)}
                              className="rounded-md bg-brand-600/10 px-2 py-0.5 text-[10px] text-brand-300 hover:bg-brand-600/20 transition"
                            >
                              + Select Card
                            </button>
                          </div>
                          {linkedCards.length > 0 ? (
                            <div className="space-y-1">
                              {linkedCards.map((card) => {
                                const cmeta = CARD_KIND_META[card.kind] ||
                                  CARD_KIND_META.text || {
                                    icon: FileText,
                                    color: 'text-zinc-400',
                                    bg: 'bg-zinc-500/10',
                                  }
                                const CIcon = cmeta.icon || FileText
                                return (
                                  <div
                                    key={card.id}
                                    className="group/card flex items-start gap-2 rounded-lg border border-border/30 bg-surface/40 px-2.5 py-2"
                                  >
                                    <div
                                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${cmeta.bg || 'bg-zinc-500/10'}`}
                                    >
                                      <CIcon
                                        className={`h-3 w-3 ${cmeta.color || 'text-zinc-400'}`}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="truncate text-[11px] font-medium text-zinc-300">
                                          {card.title}
                                        </span>
                                        <StarRating rating={card.rating} size="sm" readonly />
                                      </div>
                                      {card.content && (
                                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">
                                          {card.content.slice(0, 150)}
                                        </p>
                                      )}
                                    </div>
                                    <button
                                      onClick={() =>
                                        dispatch({
                                          type: 'UNLINK_CARD_FROM_OUTLINE',
                                          deckId,
                                          outlineId: item.id,
                                          cardId: card.id,
                                        })
                                      }
                                      className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-700 opacity-0 transition hover:text-red-400 group-hover/card:opacity-100"
                                    >
                                      <Unlink2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-[11px] text-zinc-700 italic px-1">
                              Drag a card here or click "Select Card"
                            </p>
                          )}
                        </div>

                        {/* Speaker notes */}
                        <div>
                          <label className="mb-1.5 block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                            Speaker Notes
                          </label>
                          <input
                            type="text"
                            value={item.speakerNotes || item.notes || ''}
                            onChange={(e) =>
                              dispatch({
                                type: 'UPDATE_OUTLINE_ITEM',
                                deckId,
                                id: item.id,
                                updates: { speakerNotes: e.target.value },
                              })
                            }
                            placeholder="Speaker notes..."
                            className="w-full rounded-lg border border-border/40 bg-surface/50 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-brand-500/30 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <AddSlideInline onAdd={(type) => addSlide(type, index + 1)} />
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Card view ═══ */}
        {viewMode === 'card' && (
          <div className="p-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {outline.map((item, index) => {
                const meta = SLIDE_TYPE_META[item.type] || SLIDE_TYPE_META.content
                const Icon = meta.icon
                const linkedCards = getCards(item)
                const isExpanded = expandedId === item.id

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => handleDragOver(e, item.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, item.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className={`group relative rounded-xl border overflow-hidden transition-all cursor-pointer ${
                      item.isStreaming
                        ? 'animate-streaming border-brand-400/30'
                        : isExpanded
                          ? 'border-brand-500/50 ring-1 ring-brand-500/20 shadow-lg'
                          : 'border-border/40 hover:border-border hover:shadow-md'
                    }`}
                  >
                    {/* Thumbnail preview — show image if available, otherwise large title text */}
                    <div
                      className={`relative h-28 bg-gradient-to-br ${meta.preview} flex items-center justify-center overflow-hidden`}
                    >
                      {/* Check if any linked card has an image */}
                      {(() => {
                        const imageCard = linkedCards.find(
                          (c) => c.kind === 'image' && (c.thumbnail || c.filePath),
                        )
                        if (imageCard) {
                          const imgSrc =
                            imageCard.thumbnail ||
                            (imageCard.filePath ? `/api/cards/${imageCard.id}/file` : '')
                          return (
                            <img
                              src={imgSrc}
                              alt={item.title}
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          )
                        }
                        // No image → show large title text (dynamically scaled by character count)
                        const titleText = item.title || 'Untitled'
                        const len = titleText.length
                        // Fewer chars → larger font, more chars → smaller font, fills the area
                        const fontSize =
                          len <= 2
                            ? 36
                            : len <= 4
                              ? 28
                              : len <= 8
                                ? 22
                                : len <= 16
                                  ? 17
                                  : len <= 30
                                    ? 14
                                    : 12
                        const lineClamp =
                          len <= 4 ? 'line-clamp-2' : len <= 16 ? 'line-clamp-4' : 'line-clamp-5'
                        return (
                          <p
                            className={`px-3 text-center font-bold leading-snug text-zinc-200/80 ${lineClamp}`}
                            style={{ fontSize: `${fontSize}px` }}
                          >
                            {titleText}
                          </p>
                        )
                      })()}
                      {/* Slide number */}
                      <span
                        className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-bold ${meta.bg} ${meta.color}`}
                      >
                        {index + 1}
                      </span>
                      {/* Type badge */}
                      <span
                        className={`absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[8px] font-medium ${meta.bg} ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                      {/* Linked count */}
                      {linkedCards.length > 0 && (
                        <span className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-zinc-300">
                          <Link2 className="h-2 w-2" />
                          {linkedCards.length}
                        </span>
                      )}
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeSlide(item.id)
                        }}
                        className="absolute bottom-2 left-2 rounded-md bg-black/40 p-1 text-zinc-500 opacity-0 group-hover:opacity-100 transition hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Info area */}
                    <div className="px-3 py-2.5 bg-surface-card">
                      <p className="text-xs font-medium text-zinc-200 truncate">
                        {item.title || 'Untitled Slide'}
                      </p>
                      {item.keyPoints.length > 0 && (
                        <p className="mt-1 text-[10px] text-zinc-600 line-clamp-2 leading-relaxed">
                          {item.keyPoints.slice(0, 2).join(' · ')}
                          {item.keyPoints.length > 2 && ` +${item.keyPoints.length - 2}`}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Add slide */}
              <button
                onClick={() => addSlide('content')}
                className="flex flex-col items-center justify-center h-[11rem] rounded-xl border-2 border-dashed border-border/30 text-zinc-700 transition hover:border-brand-500/30 hover:text-brand-400 hover:bg-brand-500/5"
              >
                <Plus className="h-6 w-6 mb-1" />
                <span className="text-[11px]">Add Slide</span>
              </button>
            </div>

            {/* Expanded detail panel in card view */}
            {expandedId &&
              (() => {
                const item = outline.find((o) => o.id === expandedId)
                if (!item) return null
                const meta = SLIDE_TYPE_META[item.type] || SLIDE_TYPE_META.content
                const Icon = meta.icon
                const linkedCards = getCards(item)

                return (
                  <div className="mt-4 rounded-xl border border-border bg-surface-card animate-fade-in">
                    <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
                      >
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_OUTLINE_ITEM',
                            deckId,
                            id: item.id,
                            updates: { title: e.target.value },
                          })
                        }
                        placeholder="Slide title..."
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-200 placeholder:text-zinc-700 focus:outline-none"
                      />
                      <select
                        value={item.type}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_OUTLINE_ITEM',
                            deckId,
                            id: item.id,
                            updates: { type: e.target.value as OutlineItem['type'] },
                          })
                        }
                        className="rounded-md bg-surface-3/60 px-2 py-1 text-[10px] text-zinc-500 focus:outline-none border border-transparent hover:border-border/50"
                      >
                        {Object.entries(SLIDE_TYPE_META).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="rounded-md p-1 text-zinc-600 hover:text-zinc-300"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                      <div>
                        <label className="mb-1.5 block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                          Key Points
                        </label>
                        <textarea
                          value={item.keyPoints.join('\n')}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_OUTLINE_ITEM',
                              deckId,
                              id: item.id,
                              updates: {
                                keyPoints: e.target.value.split('\n').filter((l) => l.trim()),
                              },
                            })
                          }
                          placeholder="One key point per line..."
                          rows={4}
                          className="w-full rounded-lg border border-border/40 bg-surface/50 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-brand-500/30 focus:outline-none resize-none"
                        />
                        <label className="mb-1.5 mt-3 block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                          Speaker Notes
                        </label>
                        <input
                          type="text"
                          value={item.speakerNotes || item.notes || ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'UPDATE_OUTLINE_ITEM',
                              deckId,
                              id: item.id,
                              updates: { speakerNotes: e.target.value },
                            })
                          }
                          placeholder="Speaker notes..."
                          className="w-full rounded-lg border border-border/40 bg-surface/50 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-700 focus:border-brand-500/30 focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                            <Link2 className="h-2.5 w-2.5" />
                            Linked Cards
                          </label>
                          <button
                            onClick={() => onRequestLinkCard?.(deckId, item.id)}
                            className="rounded-md bg-brand-600/10 px-2 py-0.5 text-[10px] text-brand-300 hover:bg-brand-600/20 transition"
                          >
                            + Select Card
                          </button>
                        </div>
                        {linkedCards.length > 0 ? (
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {linkedCards.map((card) => {
                              const cmeta = CARD_KIND_META[card.kind] ||
                                CARD_KIND_META.text || {
                                  icon: FileText,
                                  color: 'text-zinc-400',
                                  bg: 'bg-zinc-500/10',
                                }
                              const CIcon = cmeta.icon || FileText
                              return (
                                <div
                                  key={card.id}
                                  className="group/card flex items-center gap-2 rounded-lg border border-border/30 bg-surface/40 px-2.5 py-1.5"
                                >
                                  <div
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${cmeta.bg || 'bg-zinc-500/10'}`}
                                  >
                                    <CIcon
                                      className={`h-3 w-3 ${cmeta.color || 'text-zinc-400'}`}
                                    />
                                  </div>
                                  <span className="truncate text-[11px] text-zinc-300 flex-1">
                                    {card.title}
                                  </span>
                                  <StarRating rating={card.rating} size="sm" readonly />
                                  <button
                                    onClick={() =>
                                      dispatch({
                                        type: 'UNLINK_CARD_FROM_OUTLINE',
                                        deckId,
                                        outlineId: item.id,
                                        cardId: card.id,
                                      })
                                    }
                                    className="shrink-0 rounded p-0.5 text-zinc-700 opacity-0 transition hover:text-red-400 group-hover/card:opacity-100"
                                  >
                                    <Unlink2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border/30 bg-surface/20 px-3 py-4 text-center">
                            <Link2 className="h-5 w-5 text-zinc-700 mx-auto mb-1" />
                            <p className="text-[11px] text-zinc-700">
                              Drag a card or click to select
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
          </div>
        )}
      </div>
    </div>
  )
}
