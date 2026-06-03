import { resolve } from 'node:path'
import type { ShadowServerAppActorRef } from '@shadowob/sdk'
import { createShadowServerAppJsonStore } from '@shadowob/sdk/server-app/node'
import type {
  ResumeDocument,
  ResumePerson,
  ResumeProfile,
  ResumeSections,
  ResumeState,
} from './types.js'

const now = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`

const defaultStyle = [
  'font-family: Inter, system-ui, sans-serif;',
  'color: #172033;',
  'background: #ffffff;',
  'border-color: #d8e2f0;',
].join('\n')

function systemPerson(displayName: string): ResumePerson {
  return { kind: 'system', id: `system:${displayName.toLowerCase()}`, displayName }
}

function defaultSections(): ResumeSections {
  return {
    experience: [
      {
        id: 'exp_shadow',
        company: 'Shadow Labs',
        role: 'App Builder',
        period: '2025 - Present',
        highlights: [
          'Designed typed App command schemas for Buddy automation.',
          'Built reusable React product flows backed by persistent app data.',
        ],
      },
    ],
    education: [],
    skills: ['TypeScript', 'React', 'Apps', 'Product Systems'],
    projects: [
      {
        id: 'proj_integrations',
        name: 'Integration Demo Suite',
        description: 'Copyable apps for collaborative workflows inside Shadow channels.',
      },
    ],
  }
}

function defaultState(): ResumeState {
  const timestamp = now()
  return {
    updatedAt: timestamp,
    resumes: [
      {
        id: 'resume_demo',
        owner: systemPerson('Resume Buddy'),
        title: 'App Resume',
        profile: {
          fullName: 'Alex Builder',
          headline: 'Full-stack product engineer',
          email: 'alex@example.com',
          location: 'Remote',
          summary:
            'Builds typed, persistent collaboration apps that Buddies can operate safely through Shadow commands.',
        },
        sections: defaultSections(),
        styleCss: defaultStyle,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  }
}

function dataFilePath() {
  return resolve(process.env.RESUME_DATA_FILE ?? './data/resume.json')
}

function isState(value: unknown): value is ResumeState {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { resumes?: unknown }).resumes)
  )
}

const stateStore = createShadowServerAppJsonStore<ResumeState>({
  filePath: dataFilePath(),
  defaultValue: defaultState,
  validate: isState,
})

let state = stateStore.read()

function persist() {
  state.updatedAt = now()
  state = stateStore.write(state)
}

function person(actor: ShadowServerAppActorRef): ResumePerson {
  return actor
}

function cleanProfile(profile?: Partial<ResumeProfile>): ResumeProfile {
  return {
    fullName: profile?.fullName?.trim() || 'Untitled Candidate',
    headline: profile?.headline?.trim() || undefined,
    email: profile?.email?.trim() || undefined,
    phone: profile?.phone?.trim() || undefined,
    location: profile?.location?.trim() || undefined,
    summary: profile?.summary?.trim() || undefined,
  }
}

function cleanSections(sections?: Partial<ResumeSections>): ResumeSections {
  return {
    experience: sections?.experience ?? [],
    education: sections?.education ?? [],
    skills: Array.from(
      new Set((sections?.skills ?? []).map((skill) => skill.trim()).filter(Boolean)),
    ),
    projects: sections?.projects ?? [],
  }
}

export function listResumes(input: { query?: string; limit?: number }) {
  const query = input.query?.trim().toLowerCase()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  return structuredClone(
    state.resumes
      .filter((resume) => {
        const haystack = [
          resume.title,
          resume.profile.fullName,
          resume.profile.headline,
          resume.profile.summary,
        ]
          .join(' ')
          .toLowerCase()
        return !query || haystack.includes(query)
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit),
  )
}

export function getResume(resumeId: string) {
  const resume = state.resumes.find((item) => item.id === resumeId)
  return resume ? structuredClone(resume) : null
}

export function createResume(input: {
  title: string
  profile?: Partial<ResumeProfile>
  sections?: Partial<ResumeSections>
  styleCss?: string
  owner: ShadowServerAppActorRef
}) {
  const timestamp = now()
  const resume: ResumeDocument = {
    id: id('resume'),
    owner: person(input.owner),
    title: input.title.trim(),
    profile: cleanProfile(input.profile),
    sections: cleanSections(input.sections),
    styleCss: input.styleCss?.trim() || defaultStyle,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.resumes.push(resume)
  persist()
  return structuredClone(resume)
}

export function updateResume(input: {
  resumeId: string
  patch: {
    title?: string
    profile?: Partial<ResumeProfile>
    sections?: Partial<ResumeSections>
  }
}) {
  const resume = state.resumes.find((item) => item.id === input.resumeId)
  if (!resume) return null
  if (input.patch.title !== undefined) resume.title = input.patch.title.trim()
  if (input.patch.profile)
    resume.profile = { ...resume.profile, ...cleanProfile(input.patch.profile) }
  if (input.patch.sections)
    resume.sections = { ...resume.sections, ...cleanSections(input.patch.sections) }
  resume.updatedAt = now()
  persist()
  return structuredClone(resume)
}

export function deleteResume(resumeId: string) {
  const index = state.resumes.findIndex((item) => item.id === resumeId)
  if (index === -1) return null
  const [removed] = state.resumes.splice(index, 1)
  persist()
  return structuredClone(removed)
}

export function updateResumeStyle(input: { resumeId: string; styleCss: string }) {
  const resume = state.resumes.find((item) => item.id === input.resumeId)
  if (!resume) return null
  resume.styleCss = input.styleCss.trim()
  resume.updatedAt = now()
  persist()
  return structuredClone(resume)
}

export function generateResume(input: {
  title?: string
  profileText: string
  styleCss?: string
  owner: ShadowServerAppActorRef
}) {
  const lines = input.profileText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const fullName = lines[0] ?? 'New Candidate'
  const headline = lines.find((line) => /engineer|designer|manager|developer|teacher/i.test(line))
  const email = lines.find((line) => /@/.test(line))
  const skills = Array.from(
    new Set(
      lines
        .flatMap((line) => line.split(/[,，;；]/))
        .map((item) => item.trim())
        .filter((item) => item.length > 2 && item.length < 40)
        .slice(0, 10),
    ),
  )
  return createResume({
    title: input.title?.trim() || `${fullName} Resume`,
    profile: {
      fullName,
      headline,
      email,
      summary: lines.slice(1, 5).join(' '),
    },
    sections: {
      ...defaultSections(),
      skills: skills.length ? skills : defaultSections().skills,
    },
    styleCss: input.styleCss,
    owner: input.owner,
  })
}
