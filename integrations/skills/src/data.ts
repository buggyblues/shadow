import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, extname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type {
  SkillActor,
  SkillExternalMetadata,
  SkillFile,
  SkillFileRole,
  SkillInstall,
  SkillLibraryState,
  SkillRecord,
  SkillSource,
  SkillSummary,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`
const ENTRYPOINT = 'SKILL.md'
const SKILLS_SH_URL = 'https://www.skills.sh/'
const FIND_SKILLS_GUIDE_URL =
  'https://raw.githubusercontent.com/vercel-labs/skills/main/skills/find-skills/SKILL.md'
const execFileAsync = promisify(execFile)
const DEFAULT_SKILLS_SH_DETAIL_TTL_MS = 1000 * 60 * 60 * 24 * 7
const LEGACY_SEED_SLUGS = new Set([
  'inbox-task-completion-summary',
  'kanban-card-execution',
  'anthropic-skill-package-pattern',
])

function sha256(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string
  } catch {
    return value
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style[\s\S]*?<\/style>/giu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function fetchText(url: string, timeoutMs = 12_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
        'user-agent': 'ShadowSkills/1.0 (+https://shadow.local)',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Request failed ${response.status}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

function byteLength(content: string) {
  return Buffer.byteLength(content, 'utf8')
}

function fileByteLength(input: { content: string; encoding?: 'utf-8' | 'base64' }) {
  if (input.encoding === 'base64') return Buffer.from(input.content, 'base64').byteLength
  return byteLength(input.content)
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 72) || `skill-${Date.now()}`
  )
}

function roleForPath(path: string): SkillFileRole {
  const normalized = path.toLowerCase()
  if (normalized === 'skill.md') return 'entrypoint'
  if (normalized.startsWith('scripts/')) return 'script'
  if (normalized.startsWith('references/') || normalized.startsWith('reference/'))
    return 'reference'
  if (normalized.startsWith('assets/')) return 'asset'
  if (normalized.startsWith('examples/')) return 'example'
  return 'other'
}

function contentTypeForPath(path: string) {
  const ext = extname(path).toLowerCase()
  if (ext === '.md') return 'text/markdown'
  if (ext === '.json') return 'application/json'
  if (ext === '.yaml' || ext === '.yml') return 'application/yaml'
  if (ext === '.ts' || ext === '.tsx') return 'text/typescript'
  if (ext === '.js' || ext === '.mjs') return 'text/javascript'
  if (ext === '.py') return 'text/x-python'
  if (ext === '.sh') return 'text/x-shellscript'
  if (ext === '.svg') return 'image/svg+xml'
  return 'text/plain'
}

function isTextPath(path: string) {
  const type = contentTypeForPath(path)
  return (
    type.startsWith('text/') ||
    type === 'application/json' ||
    type === 'application/yaml' ||
    type === 'image/svg+xml'
  )
}

function systemActor(displayName: string): SkillActor {
  return {
    kind: 'system',
    id: `system:${displayName.toLowerCase().replace(/\s+/g, '-')}`,
    displayName,
  }
}

function normalizeActor(value: unknown, fallback = 'Unknown'): SkillActor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return systemActor(fallback)
  const candidate = value as Partial<SkillActor>
  const displayName =
    typeof candidate.displayName === 'string' && candidate.displayName.trim()
      ? candidate.displayName.trim()
      : fallback
  return {
    kind: typeof candidate.kind === 'string' ? candidate.kind : 'manual',
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : `${candidate.kind ?? 'manual'}:${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    userId: typeof candidate.userId === 'string' ? candidate.userId : null,
    buddyAgentId: typeof candidate.buddyAgentId === 'string' ? candidate.buddyAgentId : null,
    ownerId: typeof candidate.ownerId === 'string' ? candidate.ownerId : null,
    displayName,
    avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : null,
  }
}

function skillFile(input: {
  path: string
  content: string
  encoding?: 'utf-8' | 'base64'
  role?: SkillFileRole
  contentType?: string
  executable?: boolean
  timestamp: string
}): SkillFile {
  const path = sanitizePath(input.path)
  return {
    id: id('file'),
    path,
    role: input.role ?? roleForPath(path),
    content: input.content,
    contentType: input.contentType ?? contentTypeForPath(path),
    encoding: input.encoding ?? 'utf-8',
    sizeBytes: fileByteLength(input),
    sha256: sha256(input.content),
    executable: input.executable === true,
    updatedAt: input.timestamp,
  }
}

function sanitizePath(value: string) {
  const clean = value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!clean || clean.includes('..')) {
    throw Object.assign(new Error('Invalid skill file path'), { status: 400 })
  }
  return clean.slice(0, 240)
}

function skillFromPackage(input: {
  name: string
  description: string
  files?: Array<{
    path: string
    content: string
    encoding?: 'utf-8' | 'base64'
    role?: SkillFileRole
    contentType?: string
    executable?: boolean
  }>
  body?: string
  slug?: string
  tags?: string[]
  commandHints?: string[]
  source?: SkillSource
  external?: SkillExternalMetadata
  visibility?: SkillRecord['visibility']
  status?: SkillRecord['status']
  sharedBy: SkillActor
  timestamp: string
}): SkillRecord {
  const cleanName = input.name.trim()
  const cleanDescription = input.description.trim()
  const rawFiles =
    input.files && input.files.length > 0
      ? input.files
      : [
          {
            path: ENTRYPOINT,
            content: [
              '---',
              `name: ${slugify(cleanName)}`,
              `description: ${cleanDescription}`,
              '---',
              '',
              input.body?.trim() || cleanDescription,
            ].join('\n'),
            role: 'entrypoint' as const,
          },
        ]
  const files = rawFiles.map((file) => skillFile({ ...file, timestamp: input.timestamp }))
  if (!files.some((file) => file.path.toLowerCase() === ENTRYPOINT.toLowerCase())) {
    files.unshift(
      skillFile({
        path: ENTRYPOINT,
        role: 'entrypoint',
        timestamp: input.timestamp,
        content: [
          '---',
          `name: ${input.slug ? slugify(input.slug) : slugify(cleanName)}`,
          `description: ${cleanDescription}`,
          '---',
          '',
          cleanDescription,
        ].join('\n'),
      }),
    )
  }
  return {
    id: id('skill'),
    slug: slugify(input.slug ?? cleanName),
    name: cleanName,
    description: cleanDescription,
    entrypoint: ENTRYPOINT,
    tags: normalizeStringList(input.tags, 12, 40),
    commandHints: normalizeStringList(input.commandHints, 40, 160),
    version: 1,
    status: input.status ?? 'active',
    visibility: input.visibility ?? 'server',
    source: input.source ?? { kind: 'manual' },
    external: input.external,
    files,
    sharedBy: input.sharedBy,
    sharedAt: input.timestamp,
    updatedAt: input.timestamp,
  }
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, maxItems)
        .map((item) => item.slice(0, maxLength))
    : []
}

function defaultLibrary(): SkillLibraryState {
  const timestamp = now()
  return {
    id: 'default',
    title: 'Skills',
    updatedAt: timestamp,
    installs: [],
    skills: [],
  }
}

function dataFilePath() {
  return resolve(process.env.SKILLS_DATA_FILE ?? './data/skills-library.json')
}

function isLibraryState(value: unknown): value is SkillLibraryState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { skills?: unknown }).skills) &&
    Array.isArray((value as { installs?: unknown }).installs)
  )
}

function normalizeFile(file: SkillFile): SkillFile {
  const path = sanitizePath(file.path || ENTRYPOINT)
  const content = typeof file.content === 'string' ? file.content : ''
  const encoding = file.encoding === 'base64' ? 'base64' : 'utf-8'
  return {
    ...file,
    id: typeof file.id === 'string' && file.id ? file.id : id('file'),
    path,
    role: file.role ?? roleForPath(path),
    content,
    contentType: file.contentType || contentTypeForPath(path),
    encoding,
    sizeBytes:
      typeof file.sizeBytes === 'number' ? file.sizeBytes : fileByteLength({ content, encoding }),
    sha256: file.sha256 || sha256(content),
    updatedAt: file.updatedAt || now(),
  }
}

function normalizeSkill(skill: SkillRecord): SkillRecord {
  const files = Array.isArray(skill.files) ? skill.files.map(normalizeFile) : []
  return {
    ...skill,
    slug: slugify(skill.slug || skill.name),
    entrypoint: skill.entrypoint || ENTRYPOINT,
    tags: normalizeStringList(skill.tags, 12, 40),
    commandHints: normalizeStringList(skill.commandHints, 40, 160),
    version: typeof skill.version === 'number' ? skill.version : 1,
    status: skill.status ?? 'active',
    visibility: skill.visibility ?? 'server',
    source: skill.source ?? { kind: 'manual' },
    external: skill.external,
    files,
    sharedBy: normalizeActor(skill.sharedBy, 'Sharer'),
  }
}

function normalizeLibrary(value: SkillLibraryState): SkillLibraryState {
  const skills = value.skills
    .filter(
      (skill) =>
        !(
          LEGACY_SEED_SLUGS.has(skill.slug) &&
          (skill.sharedBy?.kind === 'system' || skill.source?.kind === 'anthropic')
        ),
    )
    .map(normalizeSkill)
  return {
    ...value,
    skills,
    installs: value.installs.map((install) => ({
      ...install,
      installedBy: normalizeActor(install.installedBy, 'Installer'),
    })),
    directory: value.directory ?? {},
  }
}

const store = createShadowServerAppJsonStore<SkillLibraryState>({
  filePath: dataFilePath(),
  defaultValue: defaultLibrary,
  validate: isLibraryState,
  normalize: normalizeLibrary,
})

let library = store.read()

function persistLibrary() {
  library = store.write(library)
}

function touch() {
  library.updatedAt = now()
  persistLibrary()
}

function installCount(skillId: string) {
  return library.installs.filter((install) => install.skillId === skillId).length
}

function toSummary(skill: SkillRecord): SkillSummary {
  return {
    id: skill.id,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    entrypoint: skill.entrypoint,
    tags: skill.tags,
    commandHints: skill.commandHints,
    version: skill.version,
    status: skill.status,
    visibility: skill.visibility,
    source: skill.source,
    external: skill.external,
    fileCount: skill.files.length,
    installCount: installCount(skill.id),
    sharedBy: skill.sharedBy,
    sharedAt: skill.sharedAt,
    updatedAt: skill.updatedAt,
  }
}

export function listSkills(input: { q?: string; tag?: string } = {}) {
  const q = input.q?.trim().toLowerCase()
  const tag = input.tag?.trim().toLowerCase()
  return library.skills
    .filter((skill) => {
      if (tag && !skill.tags.some((item) => item.toLowerCase() === tag)) return false
      if (!q) return true
      const haystack = [
        skill.name,
        skill.description,
        skill.slug,
        skill.external?.source,
        skill.external?.skillId,
        skill.external?.installCommand,
        ...skill.tags,
      ].join(' ')
      return haystack.toLowerCase().includes(q)
    })
    .map(toSummary)
}

export function listTags() {
  return Array.from(new Set(library.skills.flatMap((skill) => skill.tags))).sort((a, b) =>
    a.localeCompare(b),
  )
}

interface SkillsShEntry {
  source: string
  skillId: string
  name: string
  installs: number
  weeklyInstalls: number[]
  isOfficial: boolean
}

type SkillsShDetail = NonNullable<SkillExternalMetadata['details']>

function weeklyTotal(entry: SkillsShEntry) {
  return entry.weeklyInstalls.reduce((sum, value) => sum + value, 0)
}

function latestWeekly(entry: SkillsShEntry) {
  return entry.weeklyInstalls.at(-1) ?? 0
}

function skillsShKey(entry: Pick<SkillsShEntry, 'source' | 'skillId'>) {
  return `${entry.source}@${entry.skillId}`.toLowerCase()
}

function skillInstallCommand(entry: Pick<SkillsShEntry, 'source' | 'skillId'>) {
  return `npx skills add ${entry.source}@${entry.skillId}`
}

function skillsShSkillUrl(entry: Pick<SkillsShEntry, 'source' | 'skillId'>) {
  return `${SKILLS_SH_URL}${entry.source
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}/${encodeURIComponent(entry.skillId)}`
}

function githubRepositoryUrl(source: string) {
  const cleaned = source
    .trim()
    .replace(/^https:\/\/github\.com\//u, '')
    .replace(/\/$/u, '')
  return cleaned ? `https://github.com/${cleaned}` : undefined
}

function markdownFromHtml(html: string) {
  const block = decodeHtmlEntities(html)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/giu, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/giu, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/giu, '\n### $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/giu, '\n$1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/giu, '\n- $1')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<hr\s*\/?>/giu, '\n---\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/giu, '`$1`')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/giu, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/giu, '_$1_')
  return decodeHtmlEntities(block.replace(/<[^>]+>/gu, ' '))
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n[ \t]+/gu, '\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function extractJsonLdApplications(html: string) {
  const applications: Array<Record<string, unknown>> = []
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu
  let match = pattern.exec(html)
  while (match) {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(match[1] ?? '')) as unknown
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const record = item as Record<string, unknown>
          if (record['@type'] === 'SoftwareApplication') applications.push(record)
        }
      }
    } catch {
      /* keep parsing the rest of the page */
    }
    match = pattern.exec(html)
  }
  return applications
}

function compactCountToNumber(value: string | undefined) {
  return value ? parseCompactCount(value) : undefined
}

function extractLabelValue(html: string, label: string) {
  const pattern = new RegExp(
    `${escapeRegExp(label)}<\\/span><\\/div><div[^>]*>([\\s\\S]*?)<\\/div>`,
    'iu',
  )
  const match = html.match(pattern)
  const value = match?.[1] ? stripHtml(match[1]) : ''
  return value || undefined
}

function extractRepository(html: string, source: string) {
  const match = html.match(
    /<a[^>]+href="(https:\/\/github\.com\/[^"]+)"[^>]*(?:title="([^"]+)")?[^>]*>([\s\S]*?)<\/a>/iu,
  )
  if (!match) {
    const url = githubRepositoryUrl(source)
    return { repositoryUrl: url, repository: url?.replace('https://github.com/', '') }
  }
  const repositoryUrl = decodeHtmlEntities(match[1] ?? '')
  const repository = decodeHtmlEntities(match[2] || stripHtml(match[3] ?? ''))
  return { repositoryUrl, repository }
}

function extractAudits(html: string, sourceUrl: string) {
  const audits: NonNullable<SkillsShDetail['audits']> = []
  const pattern =
    /<a[^>]+href="([^"]*\/security\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>/giu
  let match = pattern.exec(html)
  while (match) {
    const href = decodeHtmlEntities(match[1] ?? '')
    audits.push({
      name: stripHtml(match[2] ?? ''),
      status: stripHtml(match[3] ?? ''),
      url: href.startsWith('http') ? href : new URL(href, sourceUrl).toString(),
    })
    match = pattern.exec(html)
  }
  return audits
}

function extractPreviewMarkdown(html: string) {
  const prose = html.match(/<div class="prose[^"]*">([\s\S]*?)<\/div><div class="relative">/iu)
  if (prose?.[1]) return markdownFromHtml(prose[1])
  const serialized = html.match(/\\"previewHtml\\":\\"((?:\\\\.|[^"\\])*)\\"/u)
  if (!serialized?.[1]) return undefined
  const decoded = decodeJsonString(serialized[1])
    .replace(/\\u003c/gu, '<')
    .replace(/\\n/gu, '\n')
  return markdownFromHtml(decoded)
}

function extractSkillDetail(html: string, entry: Pick<SkillsShEntry, 'source' | 'skillId'>) {
  const sourceUrl = skillsShSkillUrl(entry)
  const app = extractJsonLdApplications(html)[0]
  const installs =
    typeof app?.interactionStatistic === 'object' &&
    app.interactionStatistic &&
    !Array.isArray(app.interactionStatistic) &&
    typeof (app.interactionStatistic as { userInteractionCount?: unknown }).userInteractionCount ===
      'number'
      ? (app.interactionStatistic as { userInteractionCount: number }).userInteractionCount
      : compactCountToNumber(extractLabelValue(html, 'Installs'))
  const command = stripHtml(
    html.match(/<code[^>]*>[\s\S]*?(npx skills add[\s\S]*?)<\/code>/iu)?.[1] ?? '',
  )
    .replace(/^\$\s*/u, '')
    .trim()
  const starsLabel = extractLabelValue(html, 'GitHub Stars')
  const firstSeen = extractLabelValue(html, 'First Seen')
  const { repository, repositoryUrl } = extractRepository(html, entry.source)
  const details: SkillsShDetail = {
    fetchedAt: now(),
    description:
      typeof app?.description === 'string' && app.description.trim()
        ? app.description.trim()
        : undefined,
    repository,
    repositoryUrl,
    githubStars: compactCountToNumber(starsLabel),
    githubStarsLabel: starsLabel,
    firstSeen,
    audits: extractAudits(html, sourceUrl),
    installCommand: command || undefined,
    skillMarkdown: extractPreviewMarkdown(html),
    sourceUrl: typeof app?.url === 'string' && app.url.trim() ? app.url.trim() : sourceUrl,
    imageUrl:
      typeof app?.image === 'string' && app.image.trim()
        ? app.image.trim()
        : html.match(/property="og:image" content="([^"]+)"/iu)?.[1],
  }
  return { details, installs }
}

function shouldRefreshExternalDetails(external: SkillExternalMetadata) {
  const fetchedAt = external.details?.fetchedAt
  if (!fetchedAt) return true
  if (external.details?.skillMarkdown && !external.details.skillMarkdown.includes('\n')) return true
  return Date.now() - new Date(fetchedAt).getTime() > skillsShDetailTtlMs()
}

function skillsShDetailTtlMs() {
  const configured = Number(process.env.SKILLS_SH_DETAIL_TTL_MS)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SKILLS_SH_DETAIL_TTL_MS
}

const externalDetailRefreshes = new Map<string, Promise<SkillRecord>>()

function applyExternalDetails(skill: SkillRecord, parsed: ReturnType<typeof extractSkillDetail>) {
  if (!skill.external || skill.external.directory !== 'skills.sh') return false
  const detail = parsed.details
  skill.external = {
    ...skill.external,
    installs: parsed.installs ?? skill.external.installs,
    installCommand: detail.installCommand ?? skill.external.installCommand,
    sourceUrl: detail.sourceUrl ?? skill.external.sourceUrl,
    details: detail,
  }
  if (detail.description) skill.description = detail.description
  const markdown = detail.skillMarkdown?.trim()
  if (markdown) {
    const entry = skill.files.find((file) => file.path === skill.entrypoint)
    if (entry) {
      entry.content = markdown
      entry.contentType = 'text/markdown'
      entry.encoding = 'utf-8'
      entry.sizeBytes = byteLength(markdown)
      entry.sha256 = sha256(markdown)
      entry.updatedAt = detail.fetchedAt
    }
  }
  skill.source = {
    ...skill.source,
    url: detail.sourceUrl ?? skill.source.url,
  }
  skill.updatedAt = detail.fetchedAt
  return true
}

async function refreshExternalSkillDetails(skill: SkillRecord) {
  const external = skill.external
  if (!external || external.directory !== 'skills.sh') {
    return skill
  }
  if (!shouldRefreshExternalDetails(external)) {
    const markdown = external.details?.skillMarkdown?.trim()
    const entry = skill.files.find((file) => file.path === skill.entrypoint)
    if (markdown && entry?.content !== markdown) {
      applyExternalDetails(skill, { details: external.details!, installs: external.installs })
      touch()
    }
    return skill
  }
  const key = skillsShKey(external)
  const inFlight = externalDetailRefreshes.get(key)
  if (inFlight) return inFlight
  const refresh = fetchText(external.sourceUrl)
    .then((html) => {
      const parsed = extractSkillDetail(html, external)
      if (applyExternalDetails(skill, parsed)) touch()
      return skill
    })
    .finally(() => {
      externalDetailRefreshes.delete(key)
    })
  externalDetailRefreshes.set(key, refresh)
  return refresh
}

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function parseCompactCount(value: string) {
  const normalized = value.trim().replace(/,/g, '')
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kKmM])?$/)
  if (!match) return 0
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return 0
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'm') return Math.round(amount * 1_000_000)
  if (suffix === 'k') return Math.round(amount * 1_000)
  return Math.round(amount)
}

function parseSkillsFindOutput(output: string) {
  const lines = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const entries = new Map<string, SkillsShEntry>()
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^(.+?)\s+([\d.,]+(?:\.\d+)?[kKmM]?) installs$/)
    if (!match) continue
    const spec = match[1]?.trim() ?? ''
    const at = spec.lastIndexOf('@')
    if (at <= 0 || at === spec.length - 1) continue
    const source = spec.slice(0, at)
    const skillId = spec.slice(at + 1)
    const entry: SkillsShEntry = {
      source,
      skillId,
      name: skillId,
      installs: parseCompactCount(match[2] ?? '0'),
      weeklyInstalls: [],
      isOfficial:
        source.startsWith('anthropics/') ||
        source.startsWith('vercel-labs/') ||
        source.startsWith('microsoft/'),
    }
    entries.set(skillsShKey(entry), entry)
  }
  return Array.from(entries.values())
}

const searchCache = new Map<
  string,
  {
    expiresAt: number
    promise?: Promise<SkillsShEntry[]>
    results?: SkillsShEntry[]
  }
>()

async function findSkillsWithCli(query: string, limit: number) {
  const q = query.trim()
  if (!q) return []
  const key = q.toLowerCase()
  const cached = searchCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.results) return cached.results.slice(0, limit)
    if (cached.promise) return (await cached.promise).slice(0, limit)
  }
  const promise = execFileAsync('npx', ['--yes', 'skills', 'find', q], {
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  }).then(({ stdout, stderr }) => parseSkillsFindOutput(`${stdout}\n${stderr}`))
  searchCache.set(key, { expiresAt: Date.now() + 1000 * 60 * 15, promise })
  try {
    const results = await promise
    searchCache.set(key, { expiresAt: Date.now() + 1000 * 60 * 15, results })
    return results.slice(0, limit)
  } catch (error) {
    searchCache.delete(key)
    throw error
  }
}

function parseSkillsShEntries(html: string) {
  const entries = new Map<string, SkillsShEntry>()
  const pattern =
    /\{"source":"((?:\\.|[^"\\])+)","skillId":"((?:\\.|[^"\\])+)","name":"((?:\\.|[^"\\])+)","installs":(\d+)(?:,"weeklyInstalls":\[([^\]]*)])?(?:,"isOfficial":(true|false))?/g
  const candidates = [html, html.replace(/\\"/g, '"')]
  for (const candidate of candidates) {
    let match = pattern.exec(candidate)
    while (match) {
      const entry: SkillsShEntry = {
        source: decodeJsonString(match[1] ?? ''),
        skillId: decodeJsonString(match[2] ?? ''),
        name: decodeJsonString(match[3] ?? ''),
        installs: Number(match[4] ?? 0),
        weeklyInstalls: (match[5] ?? '')
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value)),
        isOfficial: match[6] === 'true',
      }
      if (entry.source && entry.skillId && entry.name) {
        entries.set(skillsShKey(entry), entry)
      }
      match = pattern.exec(candidate)
    }
  }
  return Array.from(entries.values())
}

function selectedSnapshotEntries(entries: SkillsShEntry[], limit = 120) {
  const popular = [...entries].sort((a, b) => b.installs - a.installs).slice(0, 50)
  const trending = [...entries].sort((a, b) => weeklyTotal(b) - weeklyTotal(a)).slice(0, 50)
  const hot = [...entries].sort((a, b) => latestWeekly(b) - latestWeekly(a)).slice(0, 30)
  const selected = new Map<string, { entry: SkillsShEntry; tags: Set<string> }>()
  const add = (entry: SkillsShEntry, tag: 'popular' | 'trending' | 'hot') => {
    const key = skillsShKey(entry)
    const existing = selected.get(key)
    if (existing) {
      existing.tags.add(tag)
      return
    }
    selected.set(key, { entry, tags: new Set(['skills.sh', tag]) })
  }
  for (const entry of popular) add(entry, 'popular')
  for (const entry of trending) add(entry, 'trending')
  for (const entry of hot) add(entry, 'hot')
  return Array.from(selected.values()).slice(0, limit)
}

function externalSkillDescription(entry: SkillsShEntry) {
  const stats =
    entry.installs > 0
      ? `${entry.installs.toLocaleString()} installs on skills.sh`
      : 'Indexed from skills.sh'
  return `${stats}. Use ${skillInstallCommand(entry)} when the Buddy needs the upstream package.`
}

function externalSkillFiles(entry: SkillsShEntry, external: SkillExternalMetadata) {
  const detailedMarkdown = external.details?.skillMarkdown?.trim()
  if (detailedMarkdown) {
    return [
      {
        path: ENTRYPOINT,
        role: 'entrypoint' as const,
        content: detailedMarkdown,
      },
      {
        path: 'references/find-skills.md',
        role: 'reference' as const,
        content: [
          '# Find skills guide',
          '',
          `Skills follows the public find-skills guide at ${FIND_SKILLS_GUIDE_URL}.`,
          '',
          `- Source: ${external.details?.repository ?? entry.source}`,
          `- Install command: \`${external.installCommand}\``,
          `- Directory URL: ${external.sourceUrl}`,
          '- Search the local server library first.',
          '- Prefer higher install count, recent weekly installs, and trusted sources.',
          '- Use `npx skills find <query>` or skills.sh when a broader search is needed.',
        ].join('\n'),
      },
    ]
  }

  return [
    {
      path: ENTRYPOINT,
      role: 'entrypoint' as const,
      content: [
        '---',
        `name: ${slugify(entry.name)}`,
        `description: ${externalSkillDescription(entry)}`,
        '---',
        '',
        `# ${entry.name}`,
        '',
        'This skill was indexed from skills.sh.',
        '',
        `- Source: ${entry.source}`,
        `- Skill id: ${entry.skillId}`,
        `- Install command: \`${external.installCommand}\``,
        `- Directory URL: ${external.sourceUrl}`,
        '',
        'When installing, prefer downloading the complete upstream skill package with the install command above. If the Skills app dispatches this as an Inbox task, report the installed path and any warnings back to the owner.',
      ].join('\n'),
    },
    {
      path: 'references/find-skills.md',
      role: 'reference' as const,
      content: [
        '# Find skills guide',
        '',
        `Skills follows the public find-skills guide at ${FIND_SKILLS_GUIDE_URL}.`,
        '',
        '- Search the local server library first.',
        '- Prefer higher install count, recent weekly installs, and trusted sources.',
        '- Use `npx skills find <query>` or skills.sh when a broader search is needed.',
      ].join('\n'),
    },
  ]
}

function upsertExternalSkill(input: {
  entry: SkillsShEntry
  tags: Set<string>
  snapshotAt: string
}) {
  const { entry, snapshotAt } = input
  const key = skillsShKey(entry)
  const installCommand = skillInstallCommand(entry)
  const snapshotKind = input.tags.has('hot')
    ? 'hot'
    : input.tags.has('trending')
      ? 'trending'
      : 'popular'
  const external: SkillExternalMetadata = {
    directory: 'skills.sh',
    source: entry.source,
    skillId: entry.skillId,
    installCommand,
    sourceUrl: skillsShSkillUrl(entry),
    installs: entry.installs,
    weeklyInstalls: entry.weeklyInstalls,
    snapshotKind,
    snapshotAt,
    isOfficial: entry.isOfficial,
  }
  const tags = Array.from(
    new Set([...input.tags, entry.isOfficial ? 'official' : '', entry.source.split('/')[0] ?? '']),
  ).filter(Boolean)
  const next = skillFromPackage({
    name: entry.name,
    slug: `skills-sh-${entry.source}-${entry.skillId}`,
    description: externalSkillDescription(entry),
    tags,
    commandHints: [installCommand, `npx skills find ${entry.name}`],
    source: {
      kind: 'skills_sh',
      label: 'skills.sh',
      url: external.sourceUrl,
    },
    external,
    sharedBy: systemActor('skills.sh'),
    timestamp: snapshotAt,
    files: externalSkillFiles(entry, external),
  })
  const stable = stableId('skill', `skills.sh:${key}`)
  const existing = library.skills.find(
    (skill) => skill.external?.directory === 'skills.sh' && skillsShKey(skill.external) === key,
  )
  if (existing?.external?.details) {
    next.external = {
      ...external,
      details: existing.external.details,
      installCommand:
        existing.external.details.installCommand ?? next.external?.installCommand ?? installCommand,
      sourceUrl:
        existing.external.details.sourceUrl ?? next.external?.sourceUrl ?? external.sourceUrl,
    }
    next.files = externalSkillFiles(entry, next.external).map((file) =>
      skillFile({ ...file, timestamp: snapshotAt }),
    )
  }
  next.id = existing?.id ?? stable
  next.sharedAt = existing?.sharedAt ?? snapshotAt
  next.version = existing?.version ?? 1
  if (existing) {
    existing.name = next.name
    existing.description = next.description
    existing.entrypoint = next.entrypoint
    existing.tags = next.tags
    existing.commandHints = next.commandHints
    existing.files = next.files
    existing.source = next.source
    existing.external = next.external
    existing.status = next.status
    existing.visibility = next.visibility
    existing.updatedAt = snapshotAt
    return existing
  }
  library.skills.push(next)
  return next
}

function markSnapshotFailure(error: unknown) {
  library.directory = {
    ...(library.directory ?? {}),
    lastError: error instanceof Error ? error.message : String(error),
  }
  touch()
}

async function snapshotSkillDirectoryInternal(input: { limit?: number } = {}) {
  const snapshotAt = now()
  const [html, guide] = await Promise.all([
    fetchText(SKILLS_SH_URL),
    fetchText(FIND_SKILLS_GUIDE_URL).catch(() => null),
  ])
  const entries = parseSkillsShEntries(html)
  if (entries.length === 0) {
    throw new Error('No skills.sh entries found in snapshot')
  }
  const selected = selectedSnapshotEntries(entries, input.limit ?? 120)
  const updatedSkills = selected.map((item) =>
    upsertExternalSkill({ entry: item.entry, tags: item.tags, snapshotAt }),
  )
  library.directory = {
    snapshotAt,
    sourceUrl: SKILLS_SH_URL,
    guideUrl: FIND_SKILLS_GUIDE_URL,
    guideUpdatedAt: guide ? snapshotAt : library.directory?.guideUpdatedAt,
    indexedCount: selected.length,
    lastOkAt: snapshotAt,
    lastError: null,
  }
  touch()
  return {
    snapshotAt,
    indexedCount: selected.length,
    totalFound: entries.length,
    skills: updatedSkills.map(toSummary),
  }
}

let snapshotInFlight: Promise<Awaited<ReturnType<typeof snapshotSkillDirectoryInternal>>> | null =
  null

export async function snapshotSkillDirectory(input: { limit?: number } = {}) {
  if (snapshotInFlight) return snapshotInFlight
  snapshotInFlight = snapshotSkillDirectoryInternal(input)
    .catch((error) => {
      markSnapshotFailure(error)
      throw error
    })
    .finally(() => {
      snapshotInFlight = null
    })
  return snapshotInFlight
}

function snapshotIntervalMs() {
  const configured = Number(process.env.SKILLS_SH_SNAPSHOT_INTERVAL_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : 1000 * 60 * 60 * 6
}

function shouldRefreshSnapshot() {
  const snapshotAt = library.directory?.snapshotAt
  if (!snapshotAt) return true
  return Date.now() - new Date(snapshotAt).getTime() > snapshotIntervalMs()
}

export async function searchSkills(
  input: { q?: string; tag?: string; limit?: number; refresh?: boolean } = {},
) {
  if (input.refresh || shouldRefreshSnapshot()) {
    await snapshotSkillDirectory().catch(() => null)
  }
  const q = input.q?.trim()
  const limit = input.limit ?? 30
  let externalSearchFailed = false
  if (q) {
    const localMatches = listSkills({ q, tag: input.tag })
    if (localMatches.length < limit) {
      try {
        const found = await findSkillsWithCli(q, limit)
        if (found.length > 0) {
          const searchedAt = now()
          for (const entry of found) {
            upsertExternalSkill({
              entry,
              tags: new Set([
                'skills.sh',
                'search',
                q.toLowerCase(),
                entry.source.split('/')[0] ?? '',
              ]),
              snapshotAt: searchedAt,
            })
          }
          touch()
        }
      } catch {
        externalSearchFailed = true
      }
    }
  }
  return {
    skills: listSkills({ q, tag: input.tag }).slice(0, limit),
    tags: listTags(),
    directory: library.directory ?? {},
    guide: {
      url: FIND_SKILLS_GUIDE_URL,
      command: q ? `npx skills find ${q}` : 'npx skills find <query>',
      ...(externalSearchFailed
        ? { warning: 'skills find failed; showing cached server results' }
        : {}),
    },
  }
}

let snapshotTimer: ReturnType<typeof setInterval> | null = null

export function startSkillDirectorySnapshotLoop() {
  if (process.env.SKILLS_SH_SNAPSHOT_DISABLED === '1') return null
  if (snapshotTimer) return snapshotTimer
  const run = () => {
    void snapshotSkillDirectory().catch((error) => {
      console.warn(`Skills snapshot failed: ${error instanceof Error ? error.message : error}`)
    })
  }
  if (shouldRefreshSnapshot()) {
    setTimeout(run, 1000)
  }
  snapshotTimer = setInterval(run, snapshotIntervalMs())
  return snapshotTimer
}

export function getSkill(skillId: string) {
  const skill = library.skills.find((item) => item.id === skillId || item.slug === skillId)
  return skill ? structuredClone(skill) : null
}

export async function getSkillWithDetails(skillId: string) {
  const skill = library.skills.find((item) => item.id === skillId || item.slug === skillId)
  if (!skill) return null
  await refreshExternalSkillDetails(skill).catch(() => skill)
  return structuredClone(skill)
}

export function shareSkill(input: {
  name: string
  description: string
  body?: string
  slug?: string
  files?: Array<{
    path: string
    content: string
    encoding?: 'utf-8' | 'base64'
    role?: SkillFileRole
    contentType?: string
    executable?: boolean
  }>
  tags?: string[]
  commandHints?: string[]
  source?: SkillSource
  external?: SkillExternalMetadata
  visibility?: SkillRecord['visibility']
  status?: SkillRecord['status']
  sharedBy: SkillActor
}) {
  const timestamp = now()
  const slug = slugify(input.slug ?? input.name)
  const existing = library.skills.find((skill) => skill.slug === slug)
  const next = skillFromPackage({ ...input, slug, timestamp })
  if (existing) {
    existing.name = next.name
    existing.description = next.description
    existing.entrypoint = next.entrypoint
    existing.tags = next.tags
    existing.commandHints = next.commandHints
    existing.files = next.files
    existing.source = next.source
    existing.external = next.external
    existing.visibility = next.visibility
    existing.status = next.status
    existing.version += 1
    existing.updatedAt = timestamp
    existing.sharedBy = next.sharedBy
    touch()
    return structuredClone(existing)
  }

  library.skills.push(next)
  touch()
  return structuredClone(next)
}

export function installSkill(input: {
  skillId: string
  targetLabel?: string
  targetBuddyAgentId?: string
  targetBuddyUserId?: string
  installedBy: SkillActor
}) {
  const skill = library.skills.find(
    (item) => item.id === input.skillId || item.slug === input.skillId,
  )
  if (!skill) return null
  const install: SkillInstall = {
    id: id('install'),
    skillId: skill.id,
    targetLabel: input.targetLabel,
    targetBuddyAgentId: input.targetBuddyAgentId ?? null,
    targetBuddyUserId: input.targetBuddyUserId ?? null,
    installedBy: input.installedBy,
    installedAt: now(),
  }
  library.installs.push(install)
  touch()
  return { skill: toSummary(skill), install: structuredClone(install) }
}

export function pullSkillPackage(skill: SkillRecord) {
  return {
    skill: structuredClone(skill),
    package: {
      name: skill.slug,
      entrypoint: skill.entrypoint,
      files: skill.files.map((file) => ({
        path: file.path,
        content: file.content,
        contentType: file.contentType,
        encoding: file.encoding,
        executable: file.executable === true,
        sha256: file.sha256,
      })),
    },
  }
}

function parseFrontmatter(content: string) {
  if (!content.startsWith('---')) return {} as Record<string, string>
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {} as Record<string, string>
  const raw = content.slice(3, end).trim()
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/)
    if (!match) continue
    result[match[1]!.trim()] = match[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return result
}

function titleFromFilename(filename: string) {
  return basename(filename)
    .replace(/\.(skill\.)?zip$/i, '')
    .replace(/\.md$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

function skillFromMarkdownPackage(input: {
  filename: string
  markdown: string
  sharedBy: SkillActor
  timestamp: string
}) {
  const meta = parseFrontmatter(input.markdown)
  const fallbackName = titleFromFilename(input.filename) || 'Shared skill'
  const firstBodyLine = input.markdown
    .replace(/^---[\s\S]*?\n---/, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean)
  return skillFromPackage({
    name: meta.name || fallbackName,
    slug: meta.name || fallbackName,
    description: meta.description || firstBodyLine || `Skill shared from ${input.filename}`,
    tags: meta.tags?.split(',').map((tag) => tag.trim()),
    source: { kind: 'server_app', label: input.filename },
    sharedBy: input.sharedBy,
    timestamp: input.timestamp,
    files: [
      {
        path: ENTRYPOINT,
        content: input.markdown,
        role: 'entrypoint',
        contentType: 'text/markdown',
      },
    ],
  })
}

function stripCommonRoot(paths: string[]) {
  const firstSegments = paths
    .map((path) => path.split('/').filter(Boolean))
    .filter((segments) => segments.length > 1)
  if (firstSegments.length !== paths.length) return paths
  const root = firstSegments[0]?.[0]
  if (!root || !firstSegments.every((segments) => segments[0] === root)) return paths
  return paths.map((path) => path.split('/').slice(1).join('/'))
}

function skillFromZipPackage(input: {
  filename: string
  dataBase64: string
  sharedBy: SkillActor
  timestamp: string
}) {
  const entries = unzipSync(new Uint8Array(Buffer.from(input.dataBase64, 'base64')))
  const rawPaths = Object.keys(entries).filter(
    (path) => !path.endsWith('/') && !path.startsWith('__MACOSX/'),
  )
  const strippedPaths = stripCommonRoot(rawPaths)
  const files = rawPaths.map((rawPath, index) => {
    const path = sanitizePath(strippedPaths[index] ?? rawPath)
    const bytes = entries[rawPath]!
    const text = isTextPath(path)
    return {
      path,
      role: roleForPath(path),
      content: text ? strFromU8(bytes) : Buffer.from(bytes).toString('base64'),
      encoding: text ? ('utf-8' as const) : ('base64' as const),
      contentType: contentTypeForPath(path),
    }
  })
  const entry = files.find((file) => file.path.toLowerCase() === ENTRYPOINT.toLowerCase())
  if (!entry) {
    throw Object.assign(new Error('Skill package must include SKILL.md'), { status: 400 })
  }
  const meta = parseFrontmatter(entry.content)
  const fallbackName = titleFromFilename(input.filename) || 'Shared skill'
  return skillFromPackage({
    name: meta.name || fallbackName,
    slug: meta.name || fallbackName,
    description: meta.description || `Skill package shared from ${input.filename}`,
    tags: meta.tags?.split(',').map((tag) => tag.trim()),
    source: { kind: 'server_app', label: input.filename },
    sharedBy: input.sharedBy,
    timestamp: input.timestamp,
    files,
  })
}

export function uploadSkillPackage(input: {
  filename: string
  contentBase64: string
  contentType?: string
  sharedBy: SkillActor
}) {
  const timestamp = now()
  const filename = input.filename.trim() || `skill-${Date.now()}.md`
  const lower = filename.toLowerCase()
  const contentType = input.contentType?.toLowerCase() ?? ''
  const next =
    lower.endsWith('.zip') || contentType.includes('zip')
      ? skillFromZipPackage({
          filename,
          dataBase64: input.contentBase64,
          sharedBy: input.sharedBy,
          timestamp,
        })
      : skillFromMarkdownPackage({
          filename,
          markdown: Buffer.from(input.contentBase64, 'base64').toString('utf8'),
          sharedBy: input.sharedBy,
          timestamp,
        })
  const existing = library.skills.find((skill) => skill.slug === next.slug)
  if (existing) {
    existing.name = next.name
    existing.description = next.description
    existing.entrypoint = next.entrypoint
    existing.tags = next.tags
    existing.commandHints = next.commandHints
    existing.files = next.files
    existing.source = next.source
    existing.external = next.external
    existing.visibility = next.visibility
    existing.status = next.status
    existing.version += 1
    existing.updatedAt = timestamp
    existing.sharedBy = next.sharedBy
    touch()
    return structuredClone(existing)
  }
  library.skills.push(next)
  touch()
  return structuredClone(next)
}

export function buildSkillZip(skill: SkillRecord) {
  const entries: Record<string, Uint8Array> = {}
  for (const file of skill.files) {
    entries[file.path] =
      file.encoding === 'base64'
        ? new Uint8Array(Buffer.from(file.content, 'base64'))
        : strToU8(file.content)
  }
  return {
    filename: `${basename(skill.slug || skill.id)}.skill.zip`,
    contentType: 'application/zip',
    bytes: Buffer.from(zipSync(entries)),
  }
}

export function exportSkillMarkdown(skill: SkillRecord) {
  const entry = skill.files.find((file) => file.path === skill.entrypoint) ?? skill.files[0]
  const fileIndex = skill.files
    .filter((file) => file.path !== entry?.path)
    .map((file) => `- ${file.path} (${file.role}, ${file.sizeBytes} bytes)`)
  return [
    entry?.content ?? `# ${skill.name}\n\n${skill.description}`,
    '',
    fileIndex.length ? '## Supporting files' : '',
    ...fileIndex,
    skill.commandHints.length ? '## Command hints' : '',
    ...skill.commandHints.map((hint) => `- ${hint}`),
  ]
    .filter(Boolean)
    .join('\n')
}

export function suggestedFilename(skill: SkillRecord) {
  return `${basename(skill.slug || skill.id)}.skill.json`
}
