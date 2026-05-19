import 'dotenv/config'
import { serve } from '@hono/node-server'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { bearerToken, introspectShadowBearerToken } from './auth.js'
import { assignCard, commentCard, createCard, getBoard, moveCard } from './data.js'
import { manifest } from './manifest.js'
import type { ShadowCommandContext, ShadowCommandEnvelope } from './types.js'
import { shellPage } from './ui.js'

const app = new Hono()
const port = Number(process.env.PORT ?? 4201)

const createCardSchema = z.object({
  title: z.string().min(1).max(180),
  columnId: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  label: z.string().max(40).optional(),
})

const moveCardSchema = z.object({
  cardId: z.string().min(1),
  columnId: z.string().min(1),
})

const assignCardSchema = z.object({
  cardId: z.string().min(1),
  assignee: z.string().min(1).max(80),
})

const commentCardSchema = z.object({
  cardId: z.string().min(1),
  body: z.string().min(1).max(1000),
})

async function authenticateShadowCommand(c: Context, expectedCommand: string) {
  const token = bearerToken(c.req.header('authorization') ?? null)
  const serverId = c.req.header('X-Shadow-Server-Id')
  const appKey = c.req.header('X-Shadow-App-Key')
  if (!token || !serverId || !appKey) {
    return { ok: false as const, response: c.json({ ok: false, error: 'missing_oauth' }, 401) }
  }
  const introspection = await introspectShadowBearerToken({ token, serverId, appKey })
  const context = introspection?.shadow
  if (!context) {
    return { ok: false as const, response: c.json({ ok: false, error: 'invalid_token' }, 401) }
  }
  if (context.command !== expectedCommand) {
    return { ok: false as const, response: c.json({ ok: false, error: 'wrong_command' }, 403) }
  }
  return { ok: true as const, context: context as unknown as ShadowCommandContext }
}

async function readOAuthEnvelope<T>(c: Context, expectedCommand: string) {
  const auth = await authenticateShadowCommand(c, expectedCommand)
  if (!auth.ok) return auth
  const raw = await c.req.text()
  let body: { input?: T }
  try {
    body = JSON.parse(raw) as { input?: T }
  } catch {
    return { ok: false as const, response: c.json({ ok: false, error: 'invalid_json' }, 400) }
  }
  return {
    ok: true as const,
    envelope: {
      input: (body.input ?? {}) as T,
      context: auth.context,
    } satisfies ShadowCommandEnvelope<T>,
  }
}

function actorLabel(envelopeOrContext: ShadowCommandEnvelope | ShadowCommandContext) {
  const context = 'context' in envelopeOrContext ? envelopeOrContext.context : envelopeOrContext
  const actor = context.actor
  return actor.buddyAgentId
    ? `buddy:${actor.buddyAgentId}`
    : `${actor.kind}:${actor.userId ?? 'unknown'}`
}

function normalizeCommandInput(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'input' in value &&
    Object.keys(value).every((key) => key === 'input' || key === 'channelId')
  ) {
    return (value as { input?: unknown }).input ?? {}
  }
  return value
}

function invalidInput(c: Context, error: z.ZodError) {
  return c.json({ ok: false, error: 'invalid_input', issues: error.issues }, 422)
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#0f172a"/>
  <rect x="18" y="22" width="18" height="52" rx="5" fill="#60a5fa"/>
  <rect x="40" y="22" width="18" height="52" rx="5" fill="#22c55e"/>
  <rect x="62" y="22" width="18" height="52" rx="5" fill="#f97316"/>
  <path d="M24 34h6M46 34h6M68 34h6M24 46h6M46 46h6M68 46h6" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
</svg>`
}

function commandResult(result: unknown) {
  return { ok: true as const, result }
}

async function runCommand(commandName: string, rawInput: unknown, actor: string) {
  switch (commandName) {
    case 'boards.get':
      return commandResult({ board: getBoard(), calledBy: actor })
    case 'cards.create': {
      const input = createCardSchema.safeParse(normalizeCommandInput(rawInput))
      if (!input.success) return { ok: false as const, status: 422, error: input.error }
      return commandResult({ card: createCard({ ...input.data, createdBy: actor }) })
    }
    case 'cards.move': {
      const input = moveCardSchema.safeParse(normalizeCommandInput(rawInput))
      if (!input.success) return { ok: false as const, status: 422, error: input.error }
      const card = moveCard(input.data.cardId, input.data.columnId)
      return card
        ? commandResult({ card })
        : { ok: false as const, status: 404, error: 'card_not_found' }
    }
    case 'cards.assign': {
      const input = assignCardSchema.safeParse(normalizeCommandInput(rawInput))
      if (!input.success) return { ok: false as const, status: 422, error: input.error }
      const card = assignCard(input.data.cardId, input.data.assignee)
      return card
        ? commandResult({ card })
        : { ok: false as const, status: 404, error: 'card_not_found' }
    }
    case 'cards.comment': {
      const input = commentCardSchema.safeParse(normalizeCommandInput(rawInput))
      if (!input.success) return { ok: false as const, status: 422, error: input.error }
      const card = commentCard(input.data.cardId, input.data.body, actor)
      return card
        ? commandResult({ card })
        : { ok: false as const, status: 404, error: 'card_not_found' }
    }
    default:
      return { ok: false as const, status: 404, error: 'command_not_found' }
  }
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))

app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))

app.get('/shadow/server', (c) => c.html(shellPage()))

app.get('/api/board', (c) => c.json(getBoard()))

app.post('/api/local/commands/:commandName', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  const result = await runCommand(c.req.param('commandName'), body.input ?? {}, 'local:user')
  if (result.ok === false) {
    return c.json({ ok: false, error: String(result.error) }, (result.status ?? 400) as 400)
  }
  return c.json(result)
})

for (const commandName of [
  'boards.get',
  'cards.create',
  'cards.move',
  'cards.assign',
  'cards.comment',
]) {
  app.post(`/api/shadow/commands/${commandName}`, async (c) => {
    const parsed = await readOAuthEnvelope<unknown>(c, commandName)
    if (!parsed.ok) return parsed.response
    const result = await runCommand(commandName, parsed.envelope.input, actorLabel(parsed.envelope))
    if (result.ok === false) {
      if (result.error instanceof z.ZodError) return invalidInput(c, result.error)
      return c.json({ ok: false, error: String(result.error) }, (result.status ?? 400) as 400)
    }
    return c.json(result)
  })
}

serve({ fetch: app.fetch, port })

console.log(`Shadow Kanban listening on http://localhost:${port}`)
