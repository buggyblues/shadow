import {
  BarChart3,
  BookOpen,
  Clock,
  Code,
  FileText,
  GitCompareArrows,
  Image,
  Lightbulb,
  Link2,
  type LucideIcon,
  MessageSquare,
  Music,
  Plus,
  Search,
  Sparkles,
  Star,
  Table,
  Tag,
  Target,
  Trash2,
  Upload,
  Video,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { convertCardToRequirement, createFileCard, genId } from '../api'
import { ALL_KINDS, CARD_KIND_META, FILE_CARD_KINDS } from '../constants/cardKind'
import { useApp } from '../store'
import type { Card, CardFilter, CardKind, TodoItem } from '../types'
import { CardDetail } from './CardDetail'
import { PhysicsDesk, type PhysicsDeskHandle } from './PhysicsDesk'
import { StarRating } from './StarRating'

interface CardGridProps {
  linkingMode?: { outlineId: string; deckId: string } | null
  onLinkToOutline?: (deckId: string, outlineId: string, cardId: string) => void
}

export default function CardGrid({ linkingMode, onLinkToOutline }: CardGridProps) {
  const { state, dispatch } = useApp()
  const cards = state.project.cards
  const physicsDeskRef = useRef<PhysicsDeskHandle>(null)

  const [filter, setFilter] = useState<CardFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [detailCard, setDetailCard] = useState<Card | null>(null)
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null)
  const [fileInput, setFileInput] = useState<File | null>(null)

  // Expose command execution globally for CommandHub integration
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>
    win.__executeCardCommand = (text: string) => {
      const result = physicsDeskRef.current?.executeCommand(text)
      if (result) {
        dispatch({
          type: 'ADD_LOG',
          message: `⚡ Command executed: ${text} → ${result.success ? '✅' : '❌ ' + result.error}`,
        })
      } else {
        dispatch({ type: 'ADD_LOG', message: `⚡ Command not recognized: ${text}` })
      }
      return result
    }
  }, [dispatch])

  // New card form
  const [newCard, setNewCard] = useState<{
    kind: CardKind
    title: string
    content: string
    tags: string
    rating: number
  }>({
    kind: 'text',
    title: '',
    content: '',
    tags: '',
    rating: 0,
  })

  // SubAgent card-to-requirement state
  const [convertingCardId, setConvertingCardId] = useState<string | null>(null)
  const [strategyMenuCardId, setStrategyMenuCardId] = useState<string | null>(null)

  /** SubAgent card-to-requirement (replaces simple MOVE_CARD_TO_TODO) */
  const handleConvertToRequirement = useCallback(
    (card: Card, strategy: 'auto' | 'expand' | 'refine' | 'decompose') => {
      setStrategyMenuCardId(null)
      setConvertingCardId(card.id)
      dispatch({ type: 'CARD_TO_REQUIREMENT_START', cardId: card.id })
      dispatch({
        type: 'ADD_LOG',
        message: `🤖 SubAgent: Converting "${card.title}" to requirement (strategy: ${strategy})`,
      })

      convertCardToRequirement(state.project.id, card, strategy, undefined, (evt) => {
        switch (evt.type) {
          case 'requirement': {
            try {
              const data = JSON.parse(evt.data) as { text: string; completionNote?: string }
              const newTodo: TodoItem = {
                id: genId(),
                text: data.text,
                done: false,
                createdAt: Date.now(),
              }
              dispatch({ type: 'ADD_TODO', todo: newTodo })
              dispatch({ type: 'CARD_TO_REQUIREMENT_DONE', cardId: card.id, todoId: newTodo.id })
              dispatch({
                type: 'ADD_LOG',
                message: `✅ SubAgent: "${card.title}" converted to requirement`,
              })
            } catch {
              /* ignore */
            }
            break
          }
          case 'done':
            setConvertingCardId(null)
            break
          case 'error':
            dispatch({ type: 'CARD_TO_REQUIREMENT_DONE', cardId: card.id, todoId: '' })
            setConvertingCardId(null)
            dispatch({ type: 'ADD_LOG', message: `❌ Card-to-requirement failed: ${evt.data}` })
            break
        }
      })
    },
    [state.project.id, dispatch],
  )

  // All cards (highest rated first) — always kept on the canvas
  const allSortedCards = cards.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0))

  // Filtered matching card IDs
  const filteredCards = cards.filter((c) => {
    if (filter !== 'all' && c.kind !== filter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        c.title.toLowerCase().includes(q) ||
        (c.content ?? '').toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return true
  })

  // Semi-hidden: when filter/search is active, non-matching cards become semi-transparent
  const hasFilter = filter !== 'all' || searchQuery.length > 0
  const matchingIds = new Set(filteredCards.map((c) => c.id))
  const hiddenCardIds = hasFilter
    ? new Set(cards.filter((c) => !matchingIds.has(c.id)).map((c) => c.id))
    : new Set<string>()

  // Get card title
  const getCardTitle = (id: string) => cards.find((c) => c.id === id)?.title || 'Unknown'

  // Manually create card
  const handleCreate = async () => {
    const isFileKind = FILE_CARD_KINDS.includes(newCard.kind)

    const card: Card = {
      id: genId(),
      kind: newCard.kind,
      title: newCard.title.trim(),
      content: newCard.content.trim(),
      sourceId: null,
      linkedCardIds: [],
      meta: {},
      tags: newCard.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      priority: 'medium',
      autoGenerated: false,
      rating: newCard.rating,
      deckIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    if (isFileKind) {
      // Create file card via API
      const result = await createFileCard(state.project.id, card, fileInput || undefined)
      if (result.ok && result.data) {
        dispatch({ type: 'ADD_CARD', card: { ...card, ...result.data } })
        dispatch({ type: 'ADD_LOG', message: `Created file card: ${card.title}` })
      }
    } else {
      dispatch({ type: 'ADD_CARD', card })
      dispatch({ type: 'ADD_LOG', message: `Manually created card: ${card.title}` })
    }

    setNewCard({ kind: 'text', title: '', content: '', tags: '', rating: 0 })
    setFileInput(null)
    setShowCreate(false)
  }

  // Handle bidirectional link
  const handleLinkCard = (targetId: string) => {
    if (!linkingCardId || linkingCardId === targetId) return
    dispatch({ type: 'LINK_CARDS', cardId: linkingCardId, targetId })
    dispatch({
      type: 'ADD_LOG',
      message: `Linked cards: ${getCardTitle(linkingCardId)} ↔ ${getCardTitle(targetId)}`,
    })
    setLinkingCardId(null)
  }

  // Count by kind
  const kindCounts = cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.kind] = (acc[c.kind] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-1 flex-col min-h-0 h-full">
      {/* Header: Search + Filter + Create — Arcane Style */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-1.5 bg-[#0a0508]/90">
        {/* Search — magic energy field */}
        <div className="relative flex-1 group">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-600/50 group-focus-within:text-amber-400 transition" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cards..."
            className="w-full rounded-lg border border-amber-900/20 bg-[#120a08]/80 pl-8 pr-2 py-1.5 text-[12px] text-amber-100/90 placeholder:text-amber-900/40 focus:border-amber-500/50 focus:outline-none focus:shadow-[0_0_16px_rgba(196,160,53,0.2),inset_0_0_8px_rgba(196,160,53,0.06)] transition-all font-medium"
            style={{ fontFamily: '"Cinzel", "Noto Sans SC", serif' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-600/50 hover:text-amber-400 transition"
            >
              ×
            </button>
          )}
        </div>

        {/* Create button — golden accent */}
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] font-medium text-amber-300/80 transition hover:bg-amber-500/20 hover:shadow-[0_0_10px_rgba(196,160,53,0.2)]"
          style={{ fontFamily: '"Cinzel", "Noto Sans SC", serif' }}
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {/* Kind filter tabs — NEON TUBE style */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.04] px-3 py-1.5 scrollbar-none bg-[#0a0508]/80">
        <button
          onClick={() => setFilter('all')}
          className={`shrink-0 rounded-full px-3 py-0.5 text-[11px] font-medium tracking-wide transition-all duration-300 ${
            filter === 'all'
              ? 'bg-brand-500/20 text-brand-300 shadow-[0_0_12px_rgba(59,130,246,0.3),inset_0_0_8px_rgba(59,130,246,0.1)] border border-brand-400/30'
              : 'text-zinc-600 hover:text-zinc-400 border border-transparent hover:border-white/[0.06]'
          }`}
          style={{ fontFamily: '"Cinzel", "Noto Sans SC", serif' }}
        >
          All ({cards.length})
        </button>
        {ALL_KINDS.filter((k) => kindCounts[k]).map((kind) => {
          const meta = CARD_KIND_META[kind] || CARD_KIND_META.text
          const KindIcon = meta?.icon || FileText
          const isActive = filter === kind
          return (
            <button
              key={kind}
              onClick={() => setFilter(kind)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition-all duration-300 ${
                isActive
                  ? `${meta.bg} ${meta.color} shadow-[0_0_10px_currentColor,inset_0_0_6px_rgba(255,255,255,0.05)] border border-current/20`
                  : 'text-zinc-600 hover:text-zinc-400 border border-transparent hover:border-white/[0.06]'
              }`}
              style={{ fontFamily: '"Cinzel", "Noto Sans SC", serif' }}
            >
              <KindIcon className="h-3 w-3" />
              {meta.label} ({kindCounts[kind]})
            </button>
          )
        })}
      </div>

      {/* Filter active indicator */}
      {hasFilter && (
        <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/5 border-b border-amber-500/10">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] text-amber-400/80">
            {filteredCards.length} / {cards.length} cards match
          </span>
          <button
            onClick={() => {
              setSearchQuery('')
              setFilter('all')
            }}
            className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300 transition"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Linking mode banner */}
      {linkingMode && (
        <div className="bg-brand-500/10 px-4 py-2 text-xs text-brand-300 flex items-center gap-2">
          <Link2 className="h-3.5 w-3.5" />
          Click a card to link to outline
        </div>
      )}
      {linkingCardId && (
        <div className="bg-purple-500/10 px-4 py-2 text-xs text-purple-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5" />
            Select a card to link (bidirectional reference)
          </span>
          <button
            onClick={() => setLinkingCardId(null)}
            className="rounded p-0.5 hover:bg-white/10"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="animate-fade-in border-b border-border bg-surface-2/50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={newCard.kind}
              onChange={(e) => {
                setNewCard({ ...newCard, kind: e.target.value as CardKind })
                setFileInput(null)
              }}
              className="rounded bg-surface-3 px-2 py-1 text-[11px] text-zinc-300 focus:outline-none"
            >
              {ALL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CARD_KIND_META[k].label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newCard.title}
              onChange={(e) => setNewCard({ ...newCard, title: e.target.value })}
              placeholder="Card title"
              className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none"
              autoFocus
            />
          </div>

          {/* File card upload zone */}
          {FILE_CARD_KINDS.includes(newCard.kind) && (
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-border bg-surface px-3 py-2 text-[11px] text-zinc-400 transition hover:border-brand-500/40 hover:text-brand-300">
                <Upload className="h-3.5 w-3.5" />
                {fileInput ? fileInput.name : `Upload ${CARD_KIND_META[newCard.kind].label} file`}
                <input
                  type="file"
                  className="hidden"
                  accept={
                    newCard.kind === 'image'
                      ? 'image/*'
                      : newCard.kind === 'audio'
                        ? 'audio/*'
                        : newCard.kind === 'video'
                          ? 'video/*'
                          : '*'
                  }
                  onChange={(e) => setFileInput(e.target.files?.[0] || null)}
                />
              </label>
              {fileInput && (
                <button
                  onClick={() => setFileInput(null)}
                  className="text-zinc-600 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          <textarea
            value={newCard.content}
            onChange={(e) => setNewCard({ ...newCard, content: e.target.value })}
            placeholder="Card content..."
            rows={3}
            className="w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none resize-none"
          />
          <div className="flex items-center gap-2">
            <Tag className="h-3 w-3 text-zinc-600" />
            <input
              type="text"
              value={newCard.tags}
              onChange={(e) => setNewCard({ ...newCard, tags: e.target.value })}
              placeholder="Tags (comma separated)"
              className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          {/* Rating */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500">Rating:</span>
            <StarRating
              rating={newCard.rating}
              onChange={(r) => setNewCard({ ...newCard, rating: r })}
              size="md"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => {
                setShowCreate(false)
                setFileInput(null)
              }}
              className="rounded px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newCard.title.trim()}
              className="rounded bg-brand-600 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-brand-500 disabled:opacity-40"
            >
              Create Card
            </button>
          </div>
        </div>
      )}

      {/* Card Physics Desk — always shows all cards */}
      <div style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center h-full">
            <Sparkles className="h-10 w-10 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No cards yet</p>
            <p className="mt-1 text-xs text-zinc-600">
              Drop materials and AI will auto-extract cards, or create one manually
            </p>
          </div>
        ) : (
          <PhysicsDesk
            ref={physicsDeskRef}
            cards={allSortedCards}
            hiddenCardIds={hiddenCardIds}
            linkingCardId={linkingCardId}
            linkingMode={linkingMode}
            onLinkCard={handleLinkCard}
            onLinkToOutline={onLinkToOutline}
            onDetail={setDetailCard}
            onDelete={(id) => dispatch({ type: 'REMOVE_CARD', id })}
            onLink={(id) => setLinkingCardId(id)}
            onConvert={handleConvertToRequirement}
            onDirectMove={(id) => {
              setStrategyMenuCardId(null)
              dispatch({ type: 'MOVE_CARD_TO_TODO', cardId: id })
            }}
            convertingCardId={convertingCardId}
            strategyMenuCardId={strategyMenuCardId}
            setStrategyMenuCardId={setStrategyMenuCardId}
            onCardAdded={(card) => {
              dispatch({ type: 'ADD_CARD', card })
              dispatch({ type: 'ADD_LOG', message: `Command added card: ${card.title}` })
            }}
            onScanResult={(cardId, nearby) => {
              const cardTitle = cards.find((c) => c.id === cardId)?.title || cardId
              dispatch({
                type: 'ADD_LOG',
                message: `🔍 Scanned around "${cardTitle}", found ${nearby.length} nearby card(s)`,
              })
            }}
          />
        )}
      </div>

      {/* Card Detail Modal */}
      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}
    </div>
  )
}

export { CARD_KIND_META, StarRating }
