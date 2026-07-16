import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  BUDDY_INBOX_DELIVERY_PERMISSION,
  deliverShadowSpaceAppLaunchOutbox,
  ensureShadowSpaceAppLaunchBuddyTaskGrant,
  fetchShadowSpaceAppLaunchInboxes,
  hasShadowSpaceAppPendingOutbox,
  SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL,
  type ShadowSpaceAppCommandName,
  type ShadowSpaceAppInboxTaskOutbox,
  ShadowSpaceAppOutbox,
  shadowSpaceAppApiBaseUrl,
  shadowSpaceAppAvatarRedirectUrl,
} from '@shadowob/sdk'
import { createShadowSpaceAppSessionManager } from '@shadowob/sdk/space-app/node'
import { type Context, Hono } from 'hono'
import {
  buildSkillZip,
  getSkill,
  getSkillWithDetails,
  installSkill,
  listSkills,
  listTags,
  searchSkills,
  snapshotSkillDirectory,
  startSkillDirectorySnapshotLoop,
  uploadSkillPackage,
} from './data.js'
import { manifest, shadowSpaceApp } from './manifest.js'
import { shadowSpaceAppManifest } from './space-app.generated.js'
import type { SkillSummary } from './types.js'
import { shellPage } from './ui.js'

type SkillsCommandName = ShadowSpaceAppCommandName<typeof shadowSpaceAppManifest>

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)
const iconCacheControl = 'public, max-age=3600'

function shadowApiBaseUrl() {
  return shadowSpaceAppApiBaseUrl(process.env)
}

const appSessions = createShadowSpaceAppSessionManager({
  appKey: shadowSpaceAppManifest.appKey,
  shadowApiBaseUrl: shadowApiBaseUrl(),
})

function redirectShadowAvatar(c: Context) {
  const response = c.redirect(shadowSpaceAppAvatarRedirectUrl(c.req.url, process.env), 302)
  response.headers.set('Cache-Control', SHADOW_SPACE_APP_PUBLIC_AVATAR_CACHE_CONTROL)
  response.headers.set('Access-Control-Allow-Origin', '*')
  return response
}

async function shadowLaunchToken(c: Context, requireCsrf = true) {
  const session = await appSessions.authorizedSession({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
    requireCsrf,
  })
  return session?.launchToken ?? ''
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function errorPayload(error: unknown) {
  const record = recordValue(error)
  const payload = recordValue(record?.payload)
  const source = payload ?? record
  const message =
    (typeof source?.error === 'string' && source.error) ||
    (typeof source?.message === 'string' && source.message) ||
    (error instanceof Error ? error.message : 'Command failed')
  return {
    ok: false,
    error: message,
    ...(typeof source?.code === 'string' ? { code: source.code } : {}),
    ...(source?.params ? { params: source.params } : {}),
  }
}

function errorStatus(error: unknown) {
  const status = recordValue(error)?.status
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500
}

function isNpxSkillsSkill(skill: SkillSummary) {
  return skill.source.kind === 'skills_sh' || skill.external?.directory === 'skills.sh'
}

function skillInstallCommand(skill: SkillSummary) {
  return (
    skill.external?.installCommand ??
    `skills skills.download --input '${JSON.stringify({ skillId: skill.id })}'`
  )
}

function skillInstallTaskBody(skill: SkillSummary) {
  if (isNpxSkillsSkill(skill)) {
    return [
      'Install this upstream skills.sh package with npx skills.',
      '',
      `Command: ${skillInstallCommand(skill)}`,
      skill.external?.sourceUrl ? `Directory: ${skill.external.sourceUrl}` : '',
      '',
      'Run the command in the Buddy runtime workspace that manages skills.',
      'Do not download the Skills App zip for this upstream package.',
      'After installation, reply with the installed path and any warnings.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    'Download the skill zip through the Skills Space App command.',
    '',
    'Command: skills skills.download',
    `Input: ${JSON.stringify({ skillId: skill.id })}`,
    `Package: ${skill.slug}.skill.zip`,
    'If this task has a claim, call the command with the task binding flags shown in the Inbox task prompt.',
    '',
    'Install the zip as a complete skill package, then reply with the installed path and any warnings.',
  ].join('\n')
}

function skillInstallRuntime(skill: SkillSummary) {
  if (isNpxSkillsSkill(skill)) {
    return {
      kind: 'npx_skills_install',
      directory: 'skills.sh',
      installCommand: skillInstallCommand(skill),
      packageFormat: 'npx-skills',
    }
  }

  return {
    kind: 'shadow_skill_install',
    appKey: shadowSpaceAppManifest.appKey,
    downloadCommand: 'skills.download',
    packageFormat: 'zip',
  }
}

async function runtimeInboxes(c: Context) {
  const token = await shadowLaunchToken(c, false)
  if (!token) return c.json({ ok: false, error: 'launch_required' }, 401)
  try {
    return c.json(
      await fetchShadowSpaceAppLaunchInboxes({
        launchToken: token,
        shadowApiBaseUrl: shadowApiBaseUrl(),
      }),
    )
  } catch (error) {
    return c.json(errorPayload(error), errorStatus(error) as 500)
  }
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const token = await shadowLaunchToken(c)
  if (!token || !hasShadowSpaceAppPendingOutbox(result.body)) return result.body
  return deliverShadowSpaceAppLaunchOutbox({
    launchToken: token,
    commandName,
    result: result.body,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
}

export const app = new Hono()
const port = Number(process.env.PORT ?? 4220)
let skillsBackgroundStarted = false
const commandNames = new Set<string>(shadowSpaceAppManifest.commands.map((command) => command.name))

const commands = shadowSpaceApp.defineCommands({
  'skills.list': (input) => ({ skills: listSkills(input), tags: listTags() }),
  'skills.search': (input) => searchSkills(input),
  'skills.get': async (input) => {
    const skill = await getSkillWithDetails(input.skillId)
    if (!skill) throw shadowSpaceApp.error(404, 'skill_not_found')
    return { skill }
  },
  'skills.snapshot': async (input) => snapshotSkillDirectory(input),
  'skills.download': (input) => {
    const skill = getSkill(input.skillId)
    if (!skill) throw shadowSpaceApp.error(404, 'skill_not_found')
    const zip = buildSkillZip(skill)
    return {
      filename: zip.filename,
      contentType: zip.contentType,
      dataBase64: zip.bytes.toString('base64'),
    }
  },
  'skills.upload': (input, { actor }) => ({
    skill: uploadSkillPackage({
      filename: input.filename,
      contentType: input.contentType,
      contentBase64: input.contentBase64,
      sharedBy: actor,
    }),
  }),
  'skills.install': (input, { actor }) => {
    const result = installSkill({
      skillId: input.skillId,
      targetLabel: input.targetBuddyLabel ?? input.targetLabel,
      targetBuddyAgentId: input.targetBuddyAgentId,
      targetBuddyUserId: input.targetBuddyUserId,
      installedBy: actor,
    })
    if (!result) throw shadowSpaceApp.error(404, 'skill_not_found')
    const inboxTasks: ShadowSpaceAppInboxTaskOutbox[] = [
      {
        title: `Install skill: ${result.skill.name}`,
        body: skillInstallTaskBody(result.skill),
        priority: 'normal',
        channelId: input.targetInboxChannelId,
        agentId: input.targetBuddyAgentId,
        agentUserId: input.targetBuddyUserId,
        assigneeLabel: input.targetBuddyLabel ?? input.targetLabel,
        idempotencyKey: `skills:install:${result.skill.id}:${input.targetBuddyAgentId}:manual:${Date.now()}`,
        requirements: {
          capabilities: ['buddy_inbox:deliver', 'workspace.read'],
          ...(isNpxSkillsSkill(result.skill)
            ? {
                skills: [{ kind: 'runtime-skill' as const, package: 'skills', required: true }],
                tools: [{ kind: 'cli', name: 'npx', required: true }],
              }
            : {
                tools: [{ kind: 'space-app-command', name: 'skills.download', required: true }],
              }),
        },
        outputContract: {
          completionPolicy: {
            mode: 'reply_terminal',
            status: 'completed',
          },
        },
        privacy: { dataClass: 'server-private', redactionRequired: true },
        required: true,
        resource: {
          kind: 'skill',
          id: result.skill.id,
          label: result.skill.name,
        },
        data: {
          copilotMode: true,
          targetInboxChannelId: input.targetInboxChannelId ?? null,
          skillId: result.skill.id,
          skillSlug: result.skill.slug,
          installCommand: skillInstallCommand(result.skill),
          runtime: skillInstallRuntime(result.skill),
        },
      },
    ]
    return new ShadowSpaceAppOutbox().enqueueInboxTasks(inboxTasks).attachTo(result)
  },
})

async function parseUploadMultipart(c: Context) {
  const form = await c.req.formData()
  const rawInput = form.get('input')
  const input =
    typeof rawInput === 'string' && rawInput.trim()
      ? (JSON.parse(rawInput) as Record<string, unknown>)
      : {}
  const field = shadowSpaceAppManifest.commands.find((item) => item.name === 'skills.upload')
    ?.binary?.field
  const file = form.get(field ?? 'file')
  if (!(file instanceof File)) {
    throw shadowSpaceApp.error(400, 'missing_skill_file')
  }
  return {
    ...input,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    contentBase64: Buffer.from(await file.arrayBuffer()).toString('base64'),
  }
}

async function shadowCommandRequest(c: Context, name: SkillsCommandName) {
  const contentType = c.req.header('content-type') ?? ''
  if (name === 'skills.upload' && contentType.includes('multipart/form-data')) {
    return {
      authorizationHeader: c.req.header('authorization'),
      requestInput: await parseUploadMultipart(c),
    }
  }
  return {
    authorizationHeader: c.req.header('authorization'),
    requestBody: await c.req.text(),
  }
}

async function executeDownloadCommand(request: Awaited<ReturnType<typeof shadowCommandRequest>>) {
  const parsed = await shadowSpaceApp.parseCommand('skills.download', request)
  if (!parsed.ok) return { kind: 'parsed' as const, parsed }
  const skill = getSkill(parsed.envelope.input.skillId)
  if (!skill) return { kind: 'error' as const, error: 'skill_not_found' }
  return { kind: 'zip' as const, zip: buildSkillZip(skill) }
}

function commandName(value: string): SkillsCommandName | null {
  return commandNames.has(value) ? (value as SkillsCommandName) : null
}

function runtimeError(status: number, error: string) {
  return Object.assign(new Error(error), { status, payload: { error } })
}

async function runtimeContext(command: SkillsCommandName, c: Context) {
  const resolution = await appSessions.commandContext({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
    commandName: command,
    manifest: shadowSpaceAppManifest,
  })
  const context = resolution.context
  if (!context) throw runtimeError(401, resolution.error ?? 'invalid_launch_token')
  return context
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#102a43"/>
  <path d="M25 23h34c7 0 12 5 12 12v38H31c-7 0-12-5-12-12V29c0-3 3-6 6-6Z" fill="#38bdf8"/>
  <path d="M31 35h28M31 47h30M31 59h20" stroke="#102a43" stroke-width="5" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/space-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
app.get('/api/media/avatar/:bucket/:key{.+}', redirectShadowAvatar)
app.get('/shadow/server', (c) => c.html(shellPage()))
app.get('/shadow/server/*', (c) => c.html(shellPage()))
app.get('/api/skills', (c) =>
  c.json({
    skills: listSkills({
      q: c.req.query('q'),
      tag: c.req.query('tag'),
    }),
    tags: listTags(),
  }),
)
app.get('/api/skills/:skillId', (c) => {
  const skill = getSkill(c.req.param('skillId'))
  if (!skill) return c.json({ ok: false, error: 'skill_not_found' }, 404)
  return c.json({ skill })
})
app.get('/api/inboxes', runtimeInboxes)

app.post('/api/shadow/session', async (c) => {
  const result = await appSessions.exchange({
    authorizationHeader: c.req.header('authorization'),
    cookieHeader: c.req.header('cookie'),
    requestUrl: c.req.url,
  })
  if (result.ok) c.header('Set-Cookie', result.setCookie)
  return c.json(result.body, result.status)
})

app.get('/api/shadow/events', async (c) => {
  const response = await appSessions.eventStream({
    cookieHeader: c.req.header('cookie'),
    lastEventId: c.req.header('last-event-id'),
  })
  return response ?? c.json({ ok: false, error: 'session_required' }, 401)
})

app.post('/api/shadow/buddy-grants/ensure', async (c) => {
  const session = await appSessions.authorizedSession({
    cookieHeader: c.req.header('cookie'),
    csrfToken: c.req.header('X-Shadow-Space-App-CSRF'),
  })
  if (!session) return c.json({ ok: false, error: 'session_required' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as {
    buddyAgentId?: unknown
    permissions?: unknown
    reason?: unknown
  }
  if (typeof body.buddyAgentId !== 'string' || typeof body.reason !== 'string') {
    return c.json({ ok: false, error: 'invalid_buddy_grant' }, 422)
  }
  return c.json(
    await ensureShadowSpaceAppLaunchBuddyTaskGrant({
      launchToken: session.launchToken,
      shadowApiBaseUrl: shadowApiBaseUrl(),
      input: {
        buddyAgentId: body.buddyAgentId,
        permissions: Array.isArray(body.permissions)
          ? body.permissions.filter((item): item is string => typeof item === 'string')
          : [BUDDY_INBOX_DELIVERY_PERMISSION],
        reason: body.reason,
      },
    }),
  )
})

async function runtimeCommand(c: Context) {
  try {
    const rawName = c.req.param('commandName')
    if (!rawName) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const name = commandName(rawName)
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const context = await runtimeContext(name, c)
    const result = await shadowSpaceApp.executeLocal(name, body.input ?? {}, context, commands)
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (error) {
    return c.json(errorPayload(error), errorStatus(error) as 500)
  }
}

app.post('/api/commands/:commandName', runtimeCommand)

app.post('/.shadow/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const request = await shadowCommandRequest(c, name)
  if (name === 'skills.download') {
    const result = await executeDownloadCommand(request)
    if (result.kind === 'error') return c.json({ ok: false, error: result.error }, 404)
    if (result.kind === 'parsed') {
      return c.json(result.parsed, result.parsed.status as 400 | 401 | 403 | 502)
    }
    c.header('Content-Type', result.zip.contentType)
    c.header('Content-Disposition', `attachment; filename="${result.zip.filename}"`)
    return c.body(result.zip.bytes)
  }
  const result = await shadowSpaceApp.executeCommand(name, request, commands)
  return c.json(result.body, result.status as 200)
})

export function startSkillsBackgroundTasks() {
  if (skillsBackgroundStarted) return
  skillsBackgroundStarted = true
  startSkillDirectorySnapshotLoop()
}

export function startStandalone() {
  serve({ fetch: app.fetch, port })
  startSkillsBackgroundTasks()
  console.log(`Skills listening on http://localhost:${port}`)
}

const entrypoint = process.argv[1]
if (entrypoint && import.meta.url === pathToFileURL(resolve(entrypoint)).href) {
  startStandalone()
}
