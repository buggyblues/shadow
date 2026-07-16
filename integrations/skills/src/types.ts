export interface SkillActor {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export type SkillFileRole = 'entrypoint' | 'reference' | 'script' | 'asset' | 'example' | 'other'

export interface SkillFile {
  id: string
  path: string
  role: SkillFileRole
  content: string
  contentType: string
  encoding: 'utf-8' | 'base64'
  sizeBytes: number
  sha256: string
  executable?: boolean
  updatedAt: string
}

export interface SkillSource {
  kind: 'manual' | 'anthropic' | 'github' | 'url' | 'space_app' | 'buddy' | 'skills_sh'
  url?: string
  label?: string
}

export interface SkillExternalMetadata {
  directory: 'skills.sh'
  source: string
  skillId: string
  installCommand: string
  sourceUrl: string
  installs?: number
  weeklyInstalls?: number[]
  snapshotKind?: 'popular' | 'trending' | 'hot'
  snapshotAt?: string
  isOfficial?: boolean
  details?: {
    fetchedAt: string
    description?: string
    repository?: string
    repositoryUrl?: string
    githubStars?: number
    githubStarsLabel?: string
    firstSeen?: string
    audits?: Array<{
      name: string
      status: string
      url?: string
    }>
    installCommand?: string
    skillMarkdown?: string
    sourceUrl?: string
    imageUrl?: string
  }
}

export interface SkillRecord {
  id: string
  slug: string
  name: string
  description: string
  entrypoint: string
  tags: string[]
  commandHints: string[]
  version: number
  status: 'active' | 'draft' | 'disabled'
  visibility: 'server' | 'private'
  source: SkillSource
  external?: SkillExternalMetadata
  files: SkillFile[]
  sharedBy: SkillActor
  sharedAt: string
  updatedAt: string
}

export interface SkillInstall {
  id: string
  skillId: string
  targetLabel?: string
  targetBuddyAgentId?: string | null
  targetBuddyUserId?: string | null
  installedBy: SkillActor
  installedAt: string
}

export interface SkillLibraryState {
  id: string
  title: string
  skills: SkillRecord[]
  installs: SkillInstall[]
  directory?: {
    snapshotAt?: string
    sourceUrl?: string
    guideUrl?: string
    guideUpdatedAt?: string
    indexedCount?: number
    lastOkAt?: string
    lastError?: string | null
  }
  updatedAt: string
}

export interface SkillSummary {
  id: string
  slug: string
  name: string
  description: string
  entrypoint: string
  tags: string[]
  commandHints: string[]
  version: number
  status: SkillRecord['status']
  visibility: SkillRecord['visibility']
  source: SkillSource
  external?: SkillExternalMetadata
  fileCount: number
  installCount: number
  sharedBy: SkillActor
  sharedAt: string
  updatedAt: string
}
