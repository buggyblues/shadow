import type { ApiResponse, Deck } from './base'
import { BASE } from './base'

export async function createDeck(
  projectId: string,
  deck: Partial<Deck>,
): Promise<ApiResponse<Deck>> {
  const res = await fetch(`${BASE}/decks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, ...deck }),
  })
  return res.json()
}
