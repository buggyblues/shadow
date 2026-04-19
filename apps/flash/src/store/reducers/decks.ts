import { updateDeck } from '../helpers'
import type { Action, AppState } from '../types'

export function deckReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'ADD_DECK':
      return {
        ...state,
        project: {
          ...state.project,
          decks: [...state.project.decks, action.deck],
          activeDeckId: action.deck.id,
          updatedAt: now,
        },
      }
    case 'UPDATE_DECK':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => ({
          ...d,
          ...action.updates,
          updatedAt: now,
        })),
      }
    case 'REMOVE_DECK': {
      const newDecks = state.project.decks.filter((d) => d.id !== action.deckId)
      const newActiveId =
        state.project.activeDeckId === action.deckId
          ? newDecks[0]?.id || null
          : state.project.activeDeckId
      return {
        ...state,
        project: {
          ...state.project,
          decks: newDecks,
          activeDeckId: newActiveId,
          cards: state.project.cards.map((c) => ({
            ...c,
            deckIds: c.deckIds.filter((d) => d !== action.deckId),
          })),
          updatedAt: now,
        },
      }
    }
    case 'SET_ACTIVE_DECK':
      return {
        ...state,
        project: { ...state.project, activeDeckId: action.deckId, updatedAt: now },
      }
    case 'SET_OUTLINE':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => ({
          ...d,
          outline: action.outline.map((o, idx) => ({
            ...o,
            slideIndex:
              typeof o.slideIndex === 'number' && !isNaN(o.slideIndex) ? o.slideIndex : idx,
            cardRefs: o.cardRefs || [],
            keyPoints: o.keyPoints || [],
            materialRefs: o.materialRefs || [],
          })),
          updatedAt: now,
        })),
      }
    case 'UPDATE_OUTLINE_ITEM':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => ({
          ...d,
          outline: d.outline.map((o) => (o.id === action.id ? { ...o, ...action.updates } : o)),
          updatedAt: now,
        })),
      }
    case 'STREAM_OUTLINE_ITEM': {
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => {
          const safeItem = {
            ...action.item,
            slideIndex:
              typeof action.item.slideIndex === 'number' && !isNaN(action.item.slideIndex)
                ? action.item.slideIndex
                : d.outline.length,
            cardRefs: action.item.cardRefs || [],
            keyPoints: action.item.keyPoints || [],
            materialRefs: action.item.materialRefs || [],
          }
          const exists = d.outline.find((o) => o.id === safeItem.id)
          const outline = exists
            ? d.outline.map((o) => (o.id === safeItem.id ? { ...o, ...safeItem } : o))
            : [...d.outline, safeItem]
          return { ...d, outline, updatedAt: now }
        }),
      }
    }
    case 'REMOVE_OUTLINE_ITEM':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => ({
          ...d,
          outline: d.outline
            .filter((o) => o.id !== action.id)
            .map((o, i) => ({ ...o, slideIndex: i })),
          updatedAt: now,
        })),
      }
    case 'REORDER_OUTLINE':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => {
          const arr = [...d.outline]
          const [moved] = arr.splice(action.fromIndex, 1)
          arr.splice(action.toIndex, 0, moved)
          return { ...d, outline: arr.map((o, i) => ({ ...o, slideIndex: i })), updatedAt: now }
        }),
      }
    case 'LINK_CARD_TO_OUTLINE':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => ({
          ...d,
          outline: d.outline.map((o) =>
            o.id === action.outlineId && !o.cardRefs.includes(action.cardId)
              ? { ...o, cardRefs: [...o.cardRefs, action.cardId] }
              : o,
          ),
          updatedAt: now,
        })),
      }
    case 'UNLINK_CARD_FROM_OUTLINE':
      return {
        ...state,
        project: updateDeck(state.project, action.deckId, (d) => ({
          ...d,
          outline: d.outline.map((o) =>
            o.id === action.outlineId
              ? { ...o, cardRefs: o.cardRefs.filter((id) => id !== action.cardId) }
              : o,
          ),
          updatedAt: now,
        })),
      }
    default:
      return undefined
  }
}
