import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ShadowServerAppCommandContext, ShadowServerAppCommandName } from '@shadowob/sdk'
import { Hono } from 'hono'
import {
  adoptCat,
  autoFeed,
  careForCat,
  getCat,
  leaderboard,
  listAssets,
  listCats,
} from './data.js'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import { shellPage } from './ui.js'

type PetcatCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4215)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'cats.assets.list': () => ({ assets: listAssets() }),
  'cats.adopt': (input, context) => ({
    cat: adoptCat({ ...input, owner: context.actor }),
  }),
  'cats.list': () => ({ cats: listCats() }),
  'cats.get': (input) => {
    const result = getCat(input.catId)
    if (!result) throw shadowApp.error(404, 'cat_not_found')
    return result
  },
  'cats.feed': (input, context) => {
    const result = careForCat({ catId: input.catId, action: 'feed', actor: context.actor })
    if (!result) throw shadowApp.error(404, 'cat_not_found')
    return result
  },
  'cats.play': (input, context) => {
    const result = careForCat({ catId: input.catId, action: 'play', actor: context.actor })
    if (!result) throw shadowApp.error(404, 'cat_not_found')
    return result
  },
  'cats.clean': (input, context) => {
    const result = careForCat({ catId: input.catId, action: 'clean', actor: context.actor })
    if (!result) throw shadowApp.error(404, 'cat_not_found')
    return result
  },
  'cats.rest': (input, context) => {
    const result = careForCat({ catId: input.catId, action: 'rest', actor: context.actor })
    if (!result) throw shadowApp.error(404, 'cat_not_found')
    return result
  },
  'cats.auto_feed': (input, context) => ({
    ...autoFeed({ ...input, actor: context.actor }),
  }),
  'cats.leaderboard': (input) => ({ leaderboard: leaderboard(input) }),
})

function commandName(value: string): PetcatCommandName | null {
  return commandNames.has(value) ? (value as PetcatCommandName) : null
}

function localContext(command: PetcatCommandName): ShadowServerAppCommandContext {
  const manifestCommand = shadowServerAppManifest.commands.find((item) => item.name === command)
  return {
    protocol: 'shadow.app/1',
    serverId: 'local',
    serverAppId: 'local',
    appKey: shadowServerAppManifest.appKey,
    command,
    actor: {
      kind: 'local',
      userId: 'local',
      profile: {
        id: 'local',
        displayName: 'Local Cat Keeper',
        avatarUrl: null,
      },
    },
    permission: manifestCommand?.permission ?? 'local',
    action: manifestCommand?.action ?? 'read',
    dataClass: manifestCommand?.dataClass ?? 'server-private',
  }
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#7c3aed"/>
  <path d="M29 43 24 24l17 10a28 28 0 0 1 14 0l17-10-5 19a27 27 0 1 1-38 0Z" fill="#fff"/>
  <circle cx="39" cy="52" r="4" fill="#7c3aed"/>
  <circle cx="57" cy="52" r="4" fill="#7c3aed"/>
  <path d="M45 62h6M42 70c4 4 8 4 12 0" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/*', serveStatic({ root: './dist/client' }))
app.get('/cats/*', serveStatic({ root: './public' }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))

app.post('/api/local/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  const result = await shadowApp.executeLocal(name, body.input ?? {}, localContext(name), commands)
  return c.json(result.body, result.status as 200)
})

app.post('/api/shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const result = await shadowApp.executeCommand(
    name,
    {
      authorizationHeader: c.req.header('authorization'),
      serverIdHeader: c.req.header('X-Shadow-Server-Id'),
      appKeyHeader: c.req.header('X-Shadow-App-Key'),
      requestBody: await c.req.text(),
    },
    commands,
  )
  return c.json(result.body, result.status as 200)
})

serve({ fetch: app.fetch, port })

console.log(`Cloud Cat listening on http://localhost:${port}`)
