import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ShadowServerAppCommandContext, ShadowServerAppCommandName } from '@shadowob/sdk'
import { ShadowServerAppOutbox } from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import {
  buildBattleBrief,
  DEFAULT_TANK_CODE,
  findActorTank,
  getMatchView,
  getTank,
  leaderboard,
  listMaps,
  listMatches,
  listTanks,
  recordChallenge,
  saveTankCode,
  simulateBattle,
} from './store.js'
import type { SkillType } from './types.js'
import { shellPage } from './ui.js'

type WarbuddyCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4218)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

function commandName(value: string): WarbuddyCommandName | null {
  return commandNames.has(value) ? (value as WarbuddyCommandName) : null
}

function localContext(command: WarbuddyCommandName): ShadowServerAppCommandContext {
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
      buddyAgentId: null,
      ownerId: null,
      profile: {
        id: 'local',
        displayName: 'Local Pilot',
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
  <rect width="96" height="96" rx="18" fill="#f5efe1"/>
  <path d="M16 70h64M18 26h60" stroke="#17130f" stroke-width="7" stroke-linecap="square"/>
  <rect x="23" y="36" width="30" height="22" rx="4" fill="#9b2f26" stroke="#17130f" stroke-width="5"/>
  <rect x="33" y="29" width="20" height="18" rx="3" fill="#202734" stroke="#17130f" stroke-width="5"/>
  <path d="M52 38h24" stroke="#17130f" stroke-width="7" stroke-linecap="square"/>
  <path d="M24 64h28M59 64h13" stroke="#9b2f26" stroke-width="5" stroke-linecap="square"/>
</svg>`
}

function statusOf(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status
  }
  return 500
}

function toCommandError(error: unknown): never {
  const status = statusOf(error)
  const message = error instanceof Error ? error.message : String(error)
  throw shadowApp.error(status, message)
}

async function handle<T>(fn: () => T | Promise<T>) {
  try {
    return await fn()
  } catch (error) {
    toCommandError(error)
  }
}

const commands = shadowApp.defineCommands({
  'tanks.list': (input) =>
    handle(() => ({
      maps: listMaps(),
      tanks: listTanks({
        query: input.query,
        ownerKind: (input.ownerKind ?? 'all') as 'all',
        limit: input.limit,
      }),
    })),
  'tanks.get': (input, { actor }) =>
    handle(() => {
      const tank = input.mine
        ? (findActorTank(actor) ??
          saveTankCode(actor, {
            code: DEFAULT_TANK_CODE,
            name: `${actor.displayName}'s Tank`,
            skillType: 'shield',
            notes: 'Starter brain created from tanks.get mine=true.',
            submittedBy: actor.displayName,
          }))
        : input.tankId
          ? getTank(input.tankId)
          : null
      if (!tank) throw Object.assign(new Error('tank_not_found'), { status: 404 })
      return { tank, maps: listMaps() }
    }),
  'tanks.saveCode': (input, { actor }) =>
    handle(() => ({
      tank: saveTankCode(actor, {
        tankId: input.tankId,
        name: input.name,
        appearance: input.appearance,
        skillType: input.skillType as SkillType | undefined,
        code: input.code,
        notes: input.notes,
        submittedBy: input.submittedBy,
      }),
    })),
  'matches.simulate': (input, { actor }) =>
    handle(() =>
      simulateBattle({
        challengerTankId: input.challengerTankId,
        defenderTankId: input.defenderTankId,
        opponentId: input.opponentId,
        mapId: input.mapId,
        seed: input.seed,
        candidate: input.candidateCode
          ? {
              actor,
              code: input.candidateCode,
              name: input.candidateName,
              skillType: input.candidateSkillType as SkillType | undefined,
            }
          : undefined,
      }),
    ),
  'matches.challenge': (input) =>
    handle(() => {
      const match = recordChallenge({
        challengerTankId: input.challengerTankId,
        defenderTankId: input.defenderTankId,
        mapId: input.mapId,
        seed: input.seed,
      })
      const result = { match }
      if (!input.announceChannelName) return result
      return new ShadowServerAppOutbox()
        .sendChannelMessage({
          channelName: input.announceChannelName,
          idempotencyKey: `warbuddy:match:${match.id}`,
          content: [
            `WarBuddy battle settled: ${match.participants.challenger.tankName} vs ${match.participants.defender.tankName}.`,
            match.winnerTankName
              ? `${match.winnerTankName} won by ${match.resultReason}.`
              : `The match ended in a draw by ${match.resultReason}.`,
            `Map: ${match.mapName}. Excitement: ${match.excitementScore}.`,
          ].join(' '),
          metadata: {
            custom: {
              warbuddy: {
                matchId: match.id,
                urlId: match.urlId,
                winnerTankId: match.winnerTankId,
              },
            },
          },
        })
        .attachTo(result)
    }),
  'matches.list': (input) =>
    handle(() => ({
      matches: listMatches({
        tankId: input.tankId,
        limit: input.limit,
        offset: input.offset,
      }),
    })),
  'matches.get': (input) =>
    handle(() =>
      getMatchView({
        matchId: input.matchId,
        view: input.view as 'summary' | 'events' | 'raw' | 'frames' | undefined,
        from: input.from,
        to: input.to,
      }),
    ),
  'leaderboard.get': (input) =>
    handle(() => ({
      leaderboard: leaderboard({
        sort: input.sort as 'rating' | 'wins' | 'win_rate' | 'excitement' | undefined,
        limit: input.limit,
      }),
    })),
  'battle.brief': (input) =>
    handle(() =>
      buildBattleBrief({
        targets: input.targets,
        mapId: input.mapId,
        opponentHint: input.opponentHint,
        notes: input.notes,
      }),
    ),
})

function errorResponse(c: Context, error: unknown) {
  const status = statusOf(error)
  const message = error instanceof Error ? error.message : 'internal_error'
  return c.json({ ok: false, error: message }, status as 500)
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/*', serveStatic({ root: './dist/client' }))
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))
app.get('/api/maps', (c) => c.json({ maps: listMaps() }))
app.get('/api/local/inboxes', (c) => c.json({ inboxes: [] }))

app.post('/api/local/commands/:commandName', async (c) => {
  try {
    const name = commandName(c.req.param('commandName'))
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const result = await shadowApp.executeLocal(
      name,
      body.input ?? {},
      localContext(name),
      commands,
    )
    return c.json(result.body, result.status as 200)
  } catch (error) {
    return errorResponse(c, error)
  }
})

app.post('/api/shadow/commands/:commandName', async (c) => {
  try {
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
  } catch (error) {
    return errorResponse(c, error)
  }
})

serve({ fetch: app.fetch, port })

console.log(`Shadow WarBuddy listening on http://localhost:${port}`)
