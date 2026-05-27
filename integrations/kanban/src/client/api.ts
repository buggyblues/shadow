import { ShadowBridge, type ShadowServerAppResultShadow } from '@shadowob/sdk/bridge'
import type { BoardCard, BoardState } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'shadow-kanban' })

async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (bridge.isAvailable()) return bridge.command(commandName, input) as Promise<T>

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return bridge.unwrapCommandPayload<T>(payload)
}

export async function getBoard() {
  const payload = await command<{ board: BoardState }>('boards.get', {})
  return payload.board
}

export function createCard(input: {
  title: string
  columnId?: string
  description?: string
  label?: string
}) {
  return command<{ card: BoardCard }>('cards.create', input)
}

export function createAndDispatchCard(input: {
  title: string
  columnId?: string
  description?: string
  label?: string
  assigneeLabel?: string
  reason?: string
}) {
  return command<{ card: BoardCard; shadow?: ShadowServerAppResultShadow }>(
    'cards.create_and_dispatch',
    input,
  )
}

export function moveCard(input: { cardId: string; columnId: string }) {
  return command<{ card: BoardCard }>('cards.move', input)
}

export function assignCard(input: { cardId: string; assignee?: string }) {
  return command<{ card: BoardCard }>('cards.assign', input)
}

export function commentCard(input: { cardId: string; body: string }) {
  return command<{ card: BoardCard; shadow?: ShadowServerAppResultShadow }>('cards.comment', input)
}

export function dispatchCard(input: { cardId: string; assigneeLabel?: string; reason?: string }) {
  return command<{ card: BoardCard; shadow?: ShadowServerAppResultShadow }>('cards.dispatch', input)
}
