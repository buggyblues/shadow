export interface ResumePerson {
  kind: string
  id: string
  userId?: string | null
  buddyAgentId?: string | null
  ownerId?: string | null
  displayName: string
  avatarUrl?: string | null
}

export interface ResumeProfile {
  fullName: string
  headline?: string
  email?: string
  phone?: string
  location?: string
  summary?: string
}

export interface ResumeExperience {
  id: string
  company: string
  role: string
  period?: string
  highlights: string[]
}

export interface ResumeEducation {
  id: string
  school: string
  degree: string
  period?: string
}

export interface ResumeProject {
  id: string
  name: string
  description: string
  link?: string
}

export interface ResumeSections {
  experience: ResumeExperience[]
  education: ResumeEducation[]
  skills: string[]
  projects: ResumeProject[]
}

export interface ResumeDocument {
  id: string
  owner: ResumePerson
  title: string
  profile: ResumeProfile
  sections: ResumeSections
  styleCss: string
  createdAt: string
  updatedAt: string
}

export interface ResumeState {
  updatedAt: string
  resumes: ResumeDocument[]
}
