import 'dotenv/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  deliverShadowServerAppLaunchOutbox,
  fetchShadowServerAppLaunchInboxes,
  hasShadowServerAppPendingOutbox,
  resolveShadowServerAppLaunchCommandContext,
  type ShadowServerAppCommandName,
  type ShadowServerAppInboxTaskOutbox,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
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
import { manifest, shadowApp } from './manifest.js'
import { shadowServerAppManifest } from './shadow-app.generated.js'
import type { SkillSummary } from './types.js'
import { shellPage } from './ui.js'

type SkillsCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fromAppRoot = (...segments: string[]) => resolve(appRoot, ...segments)
const iconCacheControl = 'public, max-age=3600'

function shadowApiBaseUrl() {
  return (process.env.SHADOWOB_SERVER_URL ?? 'http://localhost:3002').replace(/\/$/, '')
}

function shadowLaunchToken(c: Context) {
  return c.req.header('X-Shadow-Launch-Token') ?? ''
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
    'Download the skill zip through the Skills App command.',
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
    appKey: shadowServerAppManifest.appKey,
    downloadCommand: 'skills.download',
    packageFormat: 'zip',
  }
}

async function runtimeInboxes(c: Context) {
  const token = shadowLaunchToken(c)
  if (!token) return c.json({ ok: false, error: 'launch_required' }, 401)
  try {
    return c.json(
      await fetchShadowServerAppLaunchInboxes({
        launchToken: token,
        shadowApiBaseUrl: shadowApiBaseUrl(),
      }),
    )
  } catch (error) {
    return c.json(errorPayload(error), errorStatus(error) as 500)
  }
}

async function deliverLaunchOutbox(c: Context, commandName: string, result: { body: unknown }) {
  const token = shadowLaunchToken(c)
  if (!token || !hasShadowServerAppPendingOutbox(result.body)) return result.body
  return deliverShadowServerAppLaunchOutbox({
    launchToken: token,
    commandName,
    result: result.body,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
}

export const app = new Hono()
const port = Number(process.env.PORT ?? 4220)
let skillsBackgroundStarted = false
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'skills.list': (input) => ({ skills: listSkills(input), tags: listTags() }),
  'skills.search': (input) => searchSkills(input),
  'skills.get': async (input) => {
    const skill = await getSkillWithDetails(input.skillId)
    if (!skill) throw shadowApp.error(404, 'skill_not_found')
    return { skill }
  },
  'skills.snapshot': async (input) => snapshotSkillDirectory(input),
  'skills.download': (input) => {
    const skill = getSkill(input.skillId)
    if (!skill) throw shadowApp.error(404, 'skill_not_found')
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
    if (!result) throw shadowApp.error(404, 'skill_not_found')
    const inboxTasks: ShadowServerAppInboxTaskOutbox[] = [
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
                tools: [{ kind: 'shadow-app-command', name: 'skills.download', required: true }],
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
    return new ShadowServerAppOutbox().enqueueInboxTasks(inboxTasks).attachTo(result)
  },
})

async function parseUploadMultipart(c: Context) {
  const form = await c.req.formData()
  const rawInput = form.get('input')
  const input =
    typeof rawInput === 'string' && rawInput.trim()
      ? (JSON.parse(rawInput) as Record<string, unknown>)
      : {}
  const field = shadowServerAppManifest.commands.find((item) => item.name === 'skills.upload')
    ?.binary?.field
  const file = form.get(field ?? 'file')
  if (!(file instanceof File)) {
    throw shadowApp.error(400, 'missing_skill_file')
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
      serverIdHeader: c.req.header('X-Shadow-Server-Id'),
      appKeyHeader: c.req.header('X-Shadow-App-Key'),
      requestInput: await parseUploadMultipart(c),
    }
  }
  return {
    authorizationHeader: c.req.header('authorization'),
    serverIdHeader: c.req.header('X-Shadow-Server-Id'),
    appKeyHeader: c.req.header('X-Shadow-App-Key'),
    requestBody: await c.req.text(),
  }
}

async function executeDownloadCommand(request: Awaited<ReturnType<typeof shadowCommandRequest>>) {
  const parsed = await shadowApp.parseCommand('skills.download', request)
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
  const launchToken = shadowLaunchToken(c)
  if (!launchToken) throw runtimeError(401, 'launch_required')
  const context = await resolveShadowServerAppLaunchCommandContext({
    launchToken,
    commandName: command,
    manifest: shadowServerAppManifest,
    shadowApiBaseUrl: shadowApiBaseUrl(),
  })
  if (!context) throw runtimeError(401, 'invalid_launch_token')
  return context
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect width="96" height="96" rx="22" fill="#102a43"/>
  <path d="M25 23h34c7 0 12 5 12 12v38H31c-7 0-12-5-12-12V29c0-3 3-6 6-6Z" fill="#38bdf8"/>
  <path d="M31 35h28M31 47h30M31 59h20" stroke="#102a43" stroke-width="5" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) =>
  c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': iconCacheControl }),
)
app.get('/assets/cover.png', serveStatic({ root: fromAppRoot('public') }))
app.get('/assets/*', serveStatic({ root: fromAppRoot('dist/client') }))
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
app.get('/api/runtime/inboxes', runtimeInboxes)

async function runtimeCommand(c: Context) {
  try {
    const rawName = c.req.param('commandName')
    if (!rawName) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const name = commandName(rawName)
    if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
    const context = await runtimeContext(name, c)
    const result = await shadowApp.executeLocal(name, body.input ?? {}, context, commands)
    const bodyWithDeliveries = await deliverLaunchOutbox(c, name, result)
    return c.json(bodyWithDeliveries, result.status as 200)
  } catch (error) {
    return c.json(errorPayload(error), errorStatus(error) as 500)
  }
}

app.post('/api/runtime/commands/:commandName', runtimeCommand)

app.post('/api/shadow/commands/:commandName', async (c) => {
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
  const result = await shadowApp.executeCommand(name, request, commands)
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
