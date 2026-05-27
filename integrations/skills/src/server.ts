import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import {
  type ShadowServerAppCommandContext,
  type ShadowServerAppCommandName,
  type ShadowServerAppInboxTaskOutbox,
  ShadowServerAppOutbox,
} from '@shadowob/sdk'
import { type Context, Hono } from 'hono'
import {
  buildSkillZip,
  getSkill,
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
import { shellPage } from './ui.js'

type SkillsCommandName = ShadowServerAppCommandName<typeof shadowServerAppManifest>

const app = new Hono()
const port = Number(process.env.PORT ?? 4220)
const commandNames = new Set<string>(
  shadowServerAppManifest.commands.map((command) => command.name),
)

const commands = shadowApp.defineCommands({
  'skills.list': (input) => ({ skills: listSkills(input), tags: listTags() }),
  'skills.search': (input) => searchSkills(input),
  'skills.get': (input) => {
    const skill = getSkill(input.skillId)
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
        body: [
          `Download the skill zip through the Shadow Skills Server App command.`,
          '',
          `Command: shadow-skills skills.download`,
          `Input: {"skillId":"${result.skill.id}"}`,
          `Package: ${result.skill.slug}.skill.zip`,
          result.skill.external?.installCommand
            ? `Upstream install command: ${result.skill.external.installCommand}`
            : '',
          '',
          'Install the zip as a complete skill package, then reply with the installed path and any warnings.',
        ]
          .filter(Boolean)
          .join('\n'),
        priority: 'normal',
        agentId: input.targetBuddyAgentId,
        agentUserId: input.targetBuddyUserId,
        assigneeLabel: input.targetBuddyLabel ?? input.targetLabel,
        required: true,
        resource: {
          kind: 'skill',
          id: result.skill.id,
          label: result.skill.name,
        },
        data: {
          skillId: result.skill.id,
          skillSlug: result.skill.slug,
          downloadCommand: 'skills.download',
          appKey: shadowServerAppManifest.appKey,
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

function localContext(command: SkillsCommandName): ShadowServerAppCommandContext {
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
        displayName: 'Local User',
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
  <rect width="96" height="96" rx="22" fill="#102a43"/>
  <path d="M25 23h34c7 0 12 5 12 12v38H31c-7 0-12-5-12-12V29c0-3 3-6 6-6Z" fill="#38bdf8"/>
  <path d="M31 35h28M31 47h30M31 59h20" stroke="#102a43" stroke-width="5" stroke-linecap="round"/>
</svg>`
}

app.get('/.well-known/shadow-app.json', (c) => c.json(manifest()))
app.get('/assets/icon.svg', (c) => c.text(iconSvg(), 200, { 'Content-Type': 'image/svg+xml' }))
app.get('/assets/*', serveStatic({ root: './dist/client' }))
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

app.post('/api/local/commands/:commandName', async (c) => {
  const name = commandName(c.req.param('commandName'))
  if (!name) return c.json({ ok: false, error: 'command_not_found' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { input?: unknown }
  if (name === 'skills.download') {
    const result = await shadowApp.executeLocal(
      name,
      body.input ?? {},
      localContext(name),
      commands,
    )
    return c.json(result.body, result.status as 200)
  }
  const result = await shadowApp.executeLocal(name, body.input ?? {}, localContext(name), commands)
  return c.json(result.body, result.status as 200)
})

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

serve({ fetch: app.fetch, port })
startSkillDirectorySnapshotLoop()

console.log(`Shadow Skills listening on http://localhost:${port}`)
