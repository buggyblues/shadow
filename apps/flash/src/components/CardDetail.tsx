// ══════════════════════════════════════════════════════════════
// CardDetail — full-screen modal showing card metadata
// ══════════════════════════════════════════════════════════════

import { ArrowUpRight, FileText, Unlink2, X } from 'lucide-react'
import { getCardFileUrl } from '../api'
import { CARD_KIND_META, FILE_CARD_KINDS } from '../constants/cardKind'
import { useApp } from '../store'
import type { Card } from '../types'
import { StructuredCardDetail } from './CardRenderers'
import { StarRating } from './StarRating'

interface CardDetailProps {
  card: Card
  onClose: () => void
}

export function CardDetail({ card, onClose }: CardDetailProps) {
  const { state, dispatch } = useApp()
  const meta = CARD_KIND_META[card.kind] || CARD_KIND_META.text
  const Icon = meta?.icon || FileText
  const materials = state.project.materials
  const allCards = state.project.cards
  const sourceName = card.sourceId
    ? materials.find((m) => m.id === card.sourceId)?.name || null
    : null

  const linkedCards = card.linkedCardIds
    .map((id) => allCards.find((c) => c.id === id))
    .filter(Boolean) as Card[]

  const deckNames = card.deckIds
    .map((did) => state.project.decks.find((d) => d.id === did)?.title)
    .filter(Boolean) as string[]

  const isMediaCard = FILE_CARD_KINDS.includes(card.kind)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-surface-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
          >
            <Icon className={`h-4 w-4 ${meta.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-zinc-200">{card.title}</h3>
            <span className={`text-[11px] ${meta.color}`}>{meta.label}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-surface-3 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-3">
          {/* Star Rating */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-500">Rating</label>
            <StarRating
              rating={card.rating}
              onChange={(r) => dispatch({ type: 'SET_CARD_RATING', cardId: card.id, rating: r })}
              size="md"
            />
          </div>

          {/* File Preview */}
          {isMediaCard && card.filePath && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">File</label>
              {card.kind === 'image' && (
                <img
                  src={getCardFileUrl(card.id)}
                  alt={card.title}
                  className="max-h-48 rounded-lg border border-border object-contain"
                />
              )}
              {card.kind === 'audio' && (
                <audio src={getCardFileUrl(card.id)} controls className="w-full" />
              )}
              {card.kind === 'video' && (
                <video
                  src={getCardFileUrl(card.id)}
                  controls
                  className="max-h-48 w-full rounded-lg"
                />
              )}
            </div>
          )}

          {/* Content */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-500">Content</label>
            <div className="rounded-lg border border-border/50 bg-surface px-3 py-2">
              <StructuredCardDetail card={card} />
              {card.content && card.meta && Object.keys(card.meta).length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/30 card-markdown text-xs leading-relaxed text-zinc-400">
                  <StructuredCardDetail card={{ ...card, meta: {} }} />
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {card.tags.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">Tags</label>
              <div className="flex flex-wrap gap-1">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] text-zinc-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source */}
          {sourceName && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                Source Material
              </label>
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <ArrowUpRight className="h-3 w-3" /> {sourceName}
              </span>
            </div>
          )}

          {/* Assigned Deck */}
          {deckNames.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                Assigned to
              </label>
              <div className="flex flex-wrap gap-1">
                {deckNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-400"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Linked Cards */}
          {linkedCards.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-zinc-500">
                Linked Cards ({linkedCards.length})
              </label>
              <div className="space-y-1">
                {linkedCards.map((lc) => {
                  const lMeta = CARD_KIND_META[lc.kind]
                  return (
                    <div
                      key={lc.id}
                      className="flex items-center gap-2 rounded-md bg-surface px-2 py-1.5"
                    >
                      <lMeta.icon className={`h-3 w-3 ${lMeta.color}`} />
                      <span className="flex-1 truncate text-[11px] text-zinc-300">{lc.title}</span>
                      <StarRating rating={lc.rating} size="sm" readonly />
                      <button
                        onClick={() =>
                          dispatch({ type: 'UNLINK_CARDS', cardId: card.id, targetId: lc.id })
                        }
                        className="rounded p-0.5 text-zinc-600 hover:text-red-400"
                      >
                        <Unlink2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 pt-2 border-t border-border/30 text-[10px] text-zinc-600">
            <span>{card.autoGenerated ? 'AI Generated' : 'Manually Created'}</span>
            <span>·</span>
            <span>{new Date(card.createdAt).toLocaleString('en-US')}</span>
            {card.priority && (
              <>
                <span>·</span>
                <span
                  className={
                    card.priority === 'high'
                      ? 'text-red-400'
                      : card.priority === 'medium'
                        ? 'text-amber-400'
                        : 'text-zinc-500'
                  }
                >
                  {card.priority === 'high'
                    ? 'High'
                    : card.priority === 'medium'
                      ? 'Medium'
                      : 'Low'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
