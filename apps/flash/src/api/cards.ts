import type { ApiResponse, Card } from './base'
import { BASE } from './base'

export async function createCard(
  projectId: string,
  card: Partial<Card>,
): Promise<ApiResponse<Card>> {
  const res = await fetch(`${BASE}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, ...card }),
  })
  return res.json()
}

export async function createFileCard(
  projectId: string,
  card: Partial<Card>,
  file?: File,
): Promise<ApiResponse<Card>> {
  if (file) {
    const form = new FormData()
    form.append('projectId', projectId)
    form.append('cardData', JSON.stringify(card))
    form.append('file', file)
    const res = await fetch(`${BASE}/cards/file`, { method: 'POST', body: form })
    return res.json()
  }
  const res = await fetch(`${BASE}/cards/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, ...card }),
  })
  return res.json()
}

export async function updateCard(
  cardId: string,
  updates: Partial<Card>,
): Promise<ApiResponse<Card>> {
  const res = await fetch(`${BASE}/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  return res.json()
}

export async function deleteCard(cardId: string): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/cards/${cardId}`, { method: 'DELETE' })
  return res.json()
}

export async function linkCards(cardId: string, targetId: string): Promise<ApiResponse> {
  const res = await fetch(`${BASE}/cards/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, targetId }),
  })
  return res.json()
}

export function getCardFileUrl(cardId: string): string {
  return `${BASE}/cards/${cardId}/file`
}
