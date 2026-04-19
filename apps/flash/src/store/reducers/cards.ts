import type { Action, AppState } from '../types'

export function cardReducer(state: AppState, action: Action): AppState | undefined {
  const now = Date.now()
  switch (action.type) {
    case 'ADD_CARD':
      return {
        ...state,
        project: {
          ...state.project,
          cards: [...state.project.cards, { ...action.card, deckIds: action.card.deckIds || [] }],
          updatedAt: now,
        },
      }
    case 'ADD_CARDS':
      return {
        ...state,
        project: {
          ...state.project,
          cards: [
            ...state.project.cards,
            ...action.cards.map((c) => ({ ...c, deckIds: c.deckIds || [] })),
          ],
          updatedAt: now,
        },
      }
    case 'UPDATE_CARD':
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) =>
            c.id === action.id ? { ...c, ...action.updates, updatedAt: now } : c,
          ),
          updatedAt: now,
        },
      }
    case 'REMOVE_CARD': {
      const removedId = action.id
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards
            .filter((c) => c.id !== removedId)
            .map((c) => ({
              ...c,
              linkedCardIds: (c.linkedCardIds || []).filter((lid) => lid !== removedId),
            })),
          materials: state.project.materials.map((m) => ({
            ...m,
            cardIds: (m.cardIds || []).filter((cid) => cid !== removedId),
          })),
          decks: state.project.decks.map((deck) => ({
            ...deck,
            outline: deck.outline.map((o) => ({
              ...o,
              cardRefs: (o.cardRefs || []).filter((cid) => cid !== removedId),
            })),
          })),
          updatedAt: now,
        },
      }
    }
    case 'STREAM_CARD': {
      const exists = state.project.cards.find((c) => c.id === action.card.id)
      const cardWithDeckIds = { ...action.card, deckIds: action.card.deckIds || [] }
      const cards = exists
        ? state.project.cards.map((c) =>
            c.id === action.card.id ? { ...c, ...cardWithDeckIds } : c,
          )
        : [...state.project.cards, cardWithDeckIds]
      return { ...state, project: { ...state.project, cards, updatedAt: now } }
    }
    case 'SET_CARD_RATING':
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) =>
            c.id === action.cardId ? { ...c, rating: action.rating, updatedAt: now } : c,
          ),
          updatedAt: now,
        },
      }
    case 'ASSIGN_CARD_TO_DECK':
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) =>
            c.id === action.cardId && !c.deckIds.includes(action.deckId)
              ? { ...c, deckIds: [...c.deckIds, action.deckId], updatedAt: now }
              : c,
          ),
          updatedAt: now,
        },
      }
    case 'UNASSIGN_CARD_FROM_DECK':
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) =>
            c.id === action.cardId
              ? { ...c, deckIds: c.deckIds.filter((d) => d !== action.deckId), updatedAt: now }
              : c,
          ),
          updatedAt: now,
        },
      }
    case 'LINK_CARDS': {
      const { cardId, targetId } = action
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) => {
            if (c.id === cardId && !c.linkedCardIds.includes(targetId)) {
              return { ...c, linkedCardIds: [...c.linkedCardIds, targetId], updatedAt: now }
            }
            if (c.id === targetId && !c.linkedCardIds.includes(cardId)) {
              return { ...c, linkedCardIds: [...c.linkedCardIds, cardId], updatedAt: now }
            }
            return c
          }),
          updatedAt: now,
        },
      }
    }
    case 'UNLINK_CARDS': {
      const { cardId, targetId } = action
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) => {
            if (c.id === cardId)
              return { ...c, linkedCardIds: c.linkedCardIds.filter((id) => id !== targetId) }
            if (c.id === targetId)
              return { ...c, linkedCardIds: c.linkedCardIds.filter((id) => id !== cardId) }
            return c
          }),
          updatedAt: now,
        },
      }
    }
    case 'BIND_CARD_TO_MATERIAL': {
      const { cardId, materialId } = action
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) =>
            c.id === cardId ? { ...c, sourceId: materialId, updatedAt: now } : c,
          ),
          materials: state.project.materials.map((m) =>
            m.id === materialId && !m.cardIds.includes(cardId)
              ? { ...m, cardIds: [...m.cardIds, cardId] }
              : m,
          ),
          updatedAt: now,
        },
      }
    }
    case 'CARD_TO_REQUIREMENT_START':
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) =>
            c.id === action.cardId ? { ...c, isStreaming: true } : c,
          ),
          updatedAt: now,
        },
      }
    case 'CARD_TO_REQUIREMENT_DONE':
      return {
        ...state,
        project: {
          ...state.project,
          cards: state.project.cards.map((c) =>
            c.id === action.cardId ? { ...c, isStreaming: false } : c,
          ),
          updatedAt: now,
        },
      }
    default:
      return undefined
  }
}
