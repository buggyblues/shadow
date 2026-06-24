import { serve } from '@hono/node-server'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { bearerToken, introspectShadowBearerToken } from './auth.js'
import { createTicket, listTickets, updateTicketStatus } from './data.js'
import { manifest } from './manifest.js'
import type { ShadowCommandContext, ShadowCommandEnvelope } from './types.js'

const app = new Hono()
const port = Number(process.env.PORT ?? 4199)

const createTicketSchema = z.object({
  title: z.string().min(1).max(180),
  body: z.string().max(2000).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
})

const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['open', 'in_progress', 'done']),
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
  return { ok: true as const, context }
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

function shellPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Demo Desk</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #101215; color: #f4f7fb; }
      header { display: flex; justify-content: space-between; align-items: center; padding: 18px 22px; border-bottom: 1px solid rgba(255,255,255,.1); background: #171a20; }
      h1 { margin: 0; font-size: 18px; }
      main { padding: 20px; display: grid; gap: 14px; }
      .actions { display: flex; align-items: center; gap: 10px; }
      .ticket { border: 1px solid rgba(255,255,255,.1); background: #171a20; border-radius: 10px; padding: 14px; }
      .row { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      .muted { color: #9aa4b2; font-size: 13px; }
      .pill { border-radius: 999px; background: #263241; padding: 4px 8px; font-size: 12px; }
      .live { border-radius: 999px; border: 1px solid rgba(255,255,255,.16); padding: 5px 9px; color: #9aa4b2; font-size: 12px; }
      .live.on { color: #93f5c1; border-color: rgba(147,245,193,.35); background: rgba(30,120,72,.18); }
      button { border: 0; border-radius: 8px; padding: 8px 10px; background: #00e5ff; color: #071014; font-weight: 800; cursor: pointer; }
    </style>
  </head>
  <body>
    <header>
      <div>
        <h1>Demo Desk</h1>
        <div class="muted">Shadow App iframe</div>
      </div>
      <div class="actions">
        <span id="live" class="live">manual</span>
        <button id="refresh">Refresh</button>
      </div>
    </header>
    <main id="tickets"></main>
    <script>
      function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char]))
      }
      async function load() {
        const res = await fetch('/api/tickets')
        const tickets = await res.json()
        document.getElementById('tickets').innerHTML = tickets.map((ticket) => \`
          <article class="ticket">
            <div class="row">
              <strong>\${esc(ticket.id)} · \${esc(ticket.title)}</strong>
              <span class="pill">\${esc(ticket.status)}</span>
            </div>
            <p class="muted">\${esc(ticket.body || 'No details')}</p>
            <div class="muted">priority: \${esc(ticket.priority)} · updated: \${new Date(ticket.updatedAt).toLocaleString()}</div>
          </article>
        \`).join('')
      }
      document.getElementById('refresh').addEventListener('click', load)
      const params = new URLSearchParams(window.location.search)
      const eventStream = params.get('shadow_event_stream')
      if (eventStream) {
        const live = document.getElementById('live')
        const source = new EventSource(eventStream)
        source.addEventListener('ready', () => {
          live.textContent = 'live'
          live.classList.add('on')
        })
        source.addEventListener('server_app.command.completed', load)
        source.onerror = () => {
          live.textContent = 'reconnecting'
          live.classList.remove('on')
        }
      }
      load()
    </script>
  </body>
</html>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))

app.get('/assets/icon.svg', (c) =>
  c.text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#101820"/><path d="M24 28h48v34H35L24 72V28Z" fill="#00e5ff"/><path d="M35 40h26v6H35v-6Zm0 13h18v6H35v-6Z" fill="#101820"/></svg>',
    200,
    { 'Content-Type': 'image/svg+xml; charset=utf-8' },
  ),
)

app.get('/shadow/server', (c) => c.html(shellPage()))

app.get('/api/tickets', (c) => c.json(listTickets()))

app.post('/api/shadow/commands/tickets.list', async (c) => {
  const parsed = await readOAuthEnvelope<Record<string, never>>(c, 'tickets.list')
  if (!parsed.ok) return parsed.response
  return c.json({
    ok: true,
    result: {
      tickets: listTickets(),
      calledBy: actorLabel(parsed.envelope),
    },
  })
})

app.post('/api/shadow/commands/tickets.create', async (c) => {
  const parsed = await readOAuthEnvelope<unknown>(c, 'tickets.create')
  if (!parsed.ok) return parsed.response
  const inputResult = createTicketSchema.safeParse(normalizeCommandInput(parsed.envelope.input))
  if (!inputResult.success) return invalidInput(c, inputResult.error)
  const ticket = createTicket({
    ...inputResult.data,
    createdBy: actorLabel(parsed.envelope),
  })
  return c.json({ ok: true, result: { ticket } })
})

app.post('/api/shadow/commands/tickets.update_status', async (c) => {
  const parsed = await readOAuthEnvelope<unknown>(c, 'tickets.update_status')
  if (!parsed.ok) return parsed.response
  const inputResult = updateStatusSchema.safeParse(normalizeCommandInput(parsed.envelope.input))
  if (!inputResult.success) return invalidInput(c, inputResult.error)
  const input = inputResult.data
  const ticket = updateTicketStatus(input.id, input.status)
  if (!ticket) return c.json({ ok: false, error: 'ticket_not_found' }, 404)
  return c.json({ ok: true, result: { ticket } })
})

app.post('/api/shadow/commands/files.summarize_upload', async (c) => {
  const auth = await authenticateShadowCommand(c, 'files.summarize_upload')
  if (!auth.ok) return auth.response
  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File)) {
    return c.json({ ok: false, error: 'file_required' }, 422)
  }
  return c.json({
    ok: true,
    result: {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
      input: typeof body.input === 'string' ? JSON.parse(body.input) : {},
      calledBy: actorLabel(auth.context),
    },
  })
})

serve({ fetch: app.fetch, port })

console.log(`Demo Desk listening on http://localhost:${port}`)
