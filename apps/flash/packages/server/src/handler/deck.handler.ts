import type { DeckRecord } from '@shadowob/flash-types'
import { Hono } from 'hono'
import { deckService } from '../service/deck.service.js'
import { err, ok } from '../shared/result.js'

const app = new Hono()

app.post('/api/decks', async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>
  const { projectId, ...deckData } = body
  const pid = (projectId as string) || 'default'
  const deck = deckService.create(pid, deckData as Partial<DeckRecord>)
  return c.json(ok(deck))
})

app.patch('/api/decks/:id', async (c) => {
  const body = await c.req.json()
  const pid =
    ((body as Record<string, unknown>).projectId as string) || c.req.query('projectId') || 'default'
  const deck = deckService.update(pid, c.req.param('id'), body)
  if (!deck) return c.json(err('Deck not found'), 404)
  return c.json(ok(deck))
})

app.delete('/api/decks/:id', (c) => {
  const pid = c.req.query('projectId') || 'default'
  deckService.delete(pid, c.req.param('id'))
  return c.json(ok())
})

app.get('/api/decks', (c) => {
  const projectId = c.req.query('projectId') || 'default'
  const result = deckService.getAll(projectId)
  return c.json(ok(result))
})

export default app
