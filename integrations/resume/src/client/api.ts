import { ShadowBridge } from '@shadowob/sdk/bridge'
import type { ResumeDocument, ResumeProfile, ResumeSections } from '../types.js'

type CommandPayload<T> = { ok?: boolean; result?: T; error?: string } & T
const bridge = new ShadowBridge({ appKey: 'shadow-resume' })

function canUseBridge() {
  return bridge.isAvailable()
}

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  if (canUseBridge()) {
    return bridge.command(commandName, input) as Promise<T>
  }

  const res = await fetch(`/api/local/commands/${encodeURIComponent(commandName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  const payload = (await res.json()) as CommandPayload<T>
  if (!res.ok || payload.ok === false) throw new Error(payload.error || 'Command failed')
  return bridge.unwrapCommandPayload<T>(payload)
}

export function listResumes(input: { query?: string; limit?: number }) {
  return command<{ resumes: ResumeDocument[] }>('resumes.list', input)
}

export function getResume(resumeId: string) {
  return command<{ resume: ResumeDocument }>('resumes.get', { resumeId })
}

export function createResume(input: {
  title: string
  profile?: Partial<ResumeProfile>
  sections?: Partial<ResumeSections>
  styleCss?: string
}) {
  return command<{ resume: ResumeDocument }>('resumes.create', input)
}

export function updateResume(input: {
  resumeId: string
  patch: { title?: string; profile?: Partial<ResumeProfile>; sections?: Partial<ResumeSections> }
}) {
  return command<{ resume: ResumeDocument }>('resumes.update', input)
}

export function deleteResume(resumeId: string) {
  return command<{ resume: ResumeDocument }>('resumes.delete', { resumeId })
}

export function generateResume(input: { title?: string; profileText: string; styleCss?: string }) {
  return command<{ resume: ResumeDocument }>('resumes.generate', input)
}

export function updateResumeStyle(input: { resumeId: string; styleCss: string }) {
  return command<{ resume: ResumeDocument }>('resumes.style.update', input)
}
