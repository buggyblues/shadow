import { createShadowServerAppClient } from '@shadowob/sdk/bridge'
import type { ResumeDocument, ResumeProfile, ResumeSections } from '../types.js'

const shadowApp = createShadowServerAppClient()

export async function command<T>(commandName: string, input: unknown): Promise<T> {
  return shadowApp.command<T>(commandName, input)
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
