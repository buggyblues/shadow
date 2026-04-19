import { Readable } from 'node:stream'
import { Hono } from 'hono'
import { cardService } from '../service/card.service.js'
import { err, ok } from '../shared/result.js'

const app = new Hono()

app.post('/api/cards', async (c) => {
  const body = await c.req.json()
  const { projectId, ...cardData } = body as Record<string, unknown>
  const card = cardService.create({ ...cardData, projectId: projectId as string })
  return c.json(ok(card))
})

app.post('/api/cards/file', async (c) => {
  const nodeReq = (c.env as Record<string, unknown>)?.incoming as
    | Record<string, unknown>
    | undefined
  const file = (nodeReq as Record<string, unknown>)?.file as
    | { path: string; mimetype: string }
    | undefined
  const body = (nodeReq as Record<string, unknown>)?.body as Record<string, string> | undefined

  let cardData: Record<string, unknown>
  let projectId: string | undefined

  if (file) {
    try {
      cardData = JSON.parse(body?.cardData || '{}')
    } catch {
      cardData = {}
    }
    projectId = body?.projectId
  } else {
    const rawBody = body || {}
    cardData = { ...rawBody }
    projectId = rawBody.projectId
    delete cardData.projectId
  }

  const card = await cardService.createFileCard(
    cardData as Parameters<typeof cardService.createFileCard>[0],
    file || null,
    projectId,
  )
  return c.json(ok(card))
})

app.get('/api/cards/:id/file', (c) => {
  const pid = c.req.query('projectId') || 'default'
  const result = cardService.getFileStream(pid, c.req.param('id'))
  if (!result) return c.json(err('Card file not found'), 404)

  c.header('Content-Type', result.mimeType)
  c.header('Content-Disposition', 'inline')
  return new Response(Readable.toWeb(result.stream) as ReadableStream)
})

app.patch('/api/cards/:id', async (c) => {
  const body = await c.req.json()
  const pid =
    ((body as Record<string, unknown>).projectId as string) || c.req.query('projectId') || 'default'
  const card = cardService.update(pid, c.req.param('id'), body)
  if (!card) return c.json(err('Card not found'), 404)
  return c.json(ok(card))
})

app.delete('/api/cards/:id', (c) => {
  const pid = c.req.query('projectId') || 'default'
  cardService.delete(pid, c.req.param('id'))
  return c.json(ok())
})

app.post('/api/cards/link', async (c) => {
  const body = (await c.req.json()) as { projectId?: string; cardId: string; targetId: string }
  if (!body.cardId || !body.targetId) return c.json(err('Missing cardId or targetId'), 400)
  cardService.link(body.projectId || 'default', body.cardId, body.targetId)
  return c.json(ok())
})

export default app
