// ══════════════════════════════════════════════════════════════
// ACP (Agent Communication Protocol) — SSE streaming wrappers
// ══════════════════════════════════════════════════════════════

import type { Card, Deck, Material, OutlineItem, ThemePreset, TodoItem } from './base'
import { BASE } from './base'

interface AcpRequest {
  action: string
  projectId: string
  payload: Record<string, unknown>
  sessionKey?: string
}

function createAcpStream(
  request: AcpRequest,
  onEvent?: (evt: { type: string; data: string }) => void,
): { cancel: () => void } {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(`${BASE}/acp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        onEvent?.({ type: 'error', data: `HTTP ${res.status}` })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (payload === '[DONE]') {
              onEvent?.({ type: 'done', data: '' })
              return
            }
            try {
              onEvent?.(JSON.parse(payload))
            } catch {
              onEvent?.({ type: 'text', data: payload })
            }
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        onEvent?.({ type: 'error', data: (e as Error).message })
      }
    }
  })()

  return { cancel: () => controller.abort() }
}

export function curateMaterials(
  projectId: string,
  materials: Material[],
  existingCards?: Card[],
  decks?: Deck[],
  onEvent?: (evt: { type: string; data: string }) => void,
): { cancel: () => void } {
  return createAcpStream(
    { action: 'curate', projectId, payload: { materials, existingCards, decks } },
    onEvent,
  )
}

export function analyzeAndOutline(
  projectId: string,
  deckId: string,
  materials: Material[],
  cards: Card[],
  existingOutline?: OutlineItem[],
  theme?: ThemePreset,
  todos?: TodoItem[],
  onEvent?: (evt: { type: string; data: string }) => void,
): { cancel: () => void } {
  return createAcpStream(
    {
      action: 'analyze',
      projectId,
      payload: { deckId, materials, cards, existingOutline, theme, todos },
    },
    onEvent,
  )
}

export function startResearch(
  projectId: string,
  topic: string,
  materials: Material[],
  cards: Card[],
  angles: { name: string; description: string; skillId?: string }[],
  goals?: string[],
  onEvent?: (evt: { type: string; data: string }) => void,
): { cancel: () => void } {
  return createAcpStream(
    { action: 'research', projectId, payload: { topic, materials, cards, angles, goals } },
    onEvent,
  )
}

export function requestInspiration(
  projectId: string,
  materials: Material[],
  cards: Card[],
  outline: OutlineItem[],
  todos: TodoItem[],
  onEvent?: (evt: { type: string; data: string }) => void,
): { cancel: () => void } {
  return createAcpStream(
    { action: 'inspire', projectId, payload: { materials, cards, outline, todos } },
    onEvent,
  )
}

export function convertCardToRequirement(
  projectId: string,
  card: Card,
  strategy: 'auto' | 'expand' | 'refine' | 'decompose',
  context?: string,
  onEvent?: (evt: { type: string; data: string }) => void,
): { cancel: () => void } {
  return createAcpStream(
    { action: 'card_to_requirement', projectId, payload: { card, strategy, context } },
    onEvent,
  )
}
