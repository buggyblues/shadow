import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { FilePlus2, Palette, PenLine, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ResumeDocument } from '../types.js'
import {
  createResume,
  deleteResume,
  generateResume,
  getResume,
  listResumes,
  updateResume,
  updateResumeStyle,
} from './api.js'
import './styles.css'

const queryClient = new QueryClient()

type ModalMode = 'create' | 'generate' | 'edit' | 'style' | null

function App() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('resume_demo')
  const [modal, setModal] = useState<ModalMode>(null)
  const resumes = useQuery({
    queryKey: ['resumes', query],
    queryFn: () => listResumes({ query: query.trim() || undefined }),
  })
  const selected = useQuery({
    queryKey: ['resume', selectedId],
    queryFn: () => getResume(selectedId),
    enabled: !!selectedId,
  })
  const remove = useMutation({
    mutationFn: deleteResume,
    onSuccess: () => {
      void resumes.refetch()
      const next = resumes.data?.resumes.find((resume) => resume.id !== selectedId)
      setSelectedId(next?.id ?? '')
    },
  })
  const resume = selected.data?.resume

  useEffect(() => {
    if (!selectedId && resumes.data?.resumes[0]) setSelectedId(resumes.data.resumes[0].id)
  }, [resumes.data, selectedId])

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Super Resume</strong>
          <span>Buddy-ready resume workspace</span>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search resumes"
        />
        <div className="actionGrid">
          <button type="button" onClick={() => setModal('create')}>
            <FilePlus2 />
            New
          </button>
          <button type="button" onClick={() => setModal('generate')}>
            <Sparkles />
            Generate
          </button>
        </div>
        <div className="resumeList">
          {(resumes.data?.resumes ?? []).map((item) => (
            <button
              className={item.id === selectedId ? 'resumeLink isActive' : 'resumeLink'}
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{item.title}</strong>
              <span>{item.profile.fullName}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="toolbar">
          <div>
            <span className="eyebrow">Resume Builder</span>
            <h1>{resume?.title ?? 'No resume selected'}</h1>
          </div>
          <div className="toolbarActions">
            <button type="button" disabled={!resume} onClick={() => setModal('edit')}>
              <PenLine />
              Edit
            </button>
            <button type="button" disabled={!resume} onClick={() => setModal('style')}>
              <Palette />
              Style
            </button>
            <button
              className="dangerButton"
              type="button"
              disabled={!resume || remove.isPending}
              onClick={() => resume && remove.mutate(resume.id)}
            >
              <Trash2 />
              Delete
            </button>
          </div>
        </header>
        {resume ? (
          <ResumePreview resume={resume} />
        ) : (
          <div className="emptyState">Create a resume to begin.</div>
        )}
      </section>

      {modal === 'create' ? (
        <CreateModal
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setModal(null)
            setSelectedId(saved.id)
            void resumes.refetch()
          }}
        />
      ) : null}
      {modal === 'generate' ? (
        <GenerateModal
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setModal(null)
            setSelectedId(saved.id)
            void resumes.refetch()
          }}
        />
      ) : null}
      {modal === 'edit' && resume ? (
        <EditModal
          resume={resume}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            void selected.refetch()
            void resumes.refetch()
          }}
        />
      ) : null}
      {modal === 'style' && resume ? (
        <StyleModal
          resume={resume}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            void selected.refetch()
            void resumes.refetch()
          }}
        />
      ) : null}
    </main>
  )
}

function ResumePreview({ resume }: { resume: ResumeDocument }) {
  return (
    <article className="previewShell">
      <style>{`#resume-${resume.id} { ${resume.styleCss} }`}</style>
      <div className="resumePreview" id={`resume-${resume.id}`}>
        <header>
          <div>
            <h2>{resume.profile.fullName}</h2>
            <p>{resume.profile.headline}</p>
          </div>
          <div className="contactBlock">
            {[resume.profile.email, resume.profile.phone, resume.profile.location]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </header>
        {resume.profile.summary ? <p className="summary">{resume.profile.summary}</p> : null}
        <section>
          <h3>Experience</h3>
          {resume.sections.experience.map((item) => (
            <div className="resumeItem" key={item.id}>
              <strong>
                {item.role} · {item.company}
              </strong>
              <span>{item.period}</span>
              <ul>
                {item.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section>
          <h3>Skills</h3>
          <div className="skillRow">
            {resume.sections.skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </section>
        <section>
          <h3>Projects</h3>
          {resume.sections.projects.map((item) => (
            <div className="resumeItem" key={item.id}>
              <strong>{item.name}</strong>
              <p>{item.description}</p>
            </div>
          ))}
        </section>
      </div>
    </article>
  )
}

function CreateModal(props: { onClose: () => void; onSaved: (resume: ResumeDocument) => void }) {
  const [title, setTitle] = useState('New Resume')
  const [fullName, setFullName] = useState('')
  const [headline, setHeadline] = useState('')
  const [email, setEmail] = useState('')
  const [summary, setSummary] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      createResume({
        title,
        profile: { fullName, headline, email, summary },
        sections: { skills: headline.split(/[,\s]+/).filter(Boolean) },
      }),
    onSuccess: (payload) => props.onSaved(payload.resume),
  })
  return (
    <Modal title="Create Resume" onClose={props.onClose}>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Full name
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </label>
      <label>
        Headline
        <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
      </label>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Summary
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      {mutation.error ? <div className="errorText">{mutation.error.message}</div> : null}
      <button
        type="button"
        disabled={!title.trim() || !fullName.trim()}
        onClick={() => mutation.mutate()}
      >
        Save Resume
      </button>
    </Modal>
  )
}

function GenerateModal(props: { onClose: () => void; onSaved: (resume: ResumeDocument) => void }) {
  const [profileText, setProfileText] = useState(
    'Taylor Chen\nFrontend engineer, React and TypeScript\nBuilt design systems and AI-assisted workflows\ntaylor@example.com',
  )
  const mutation = useMutation({
    mutationFn: () => generateResume({ profileText }),
    onSuccess: (payload) => props.onSaved(payload.resume),
  })
  return (
    <Modal title="Generate Resume" onClose={props.onClose}>
      <label>
        Candidate notes
        <textarea value={profileText} onChange={(event) => setProfileText(event.target.value)} />
      </label>
      {mutation.error ? <div className="errorText">{mutation.error.message}</div> : null}
      <button type="button" disabled={!profileText.trim()} onClick={() => mutation.mutate()}>
        Generate Resume
      </button>
    </Modal>
  )
}

function EditModal(props: { resume: ResumeDocument; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(props.resume.title)
  const [fullName, setFullName] = useState(props.resume.profile.fullName)
  const [headline, setHeadline] = useState(props.resume.profile.headline ?? '')
  const [summary, setSummary] = useState(props.resume.profile.summary ?? '')
  const [skills, setSkills] = useState(props.resume.sections.skills.join(', '))
  const mutation = useMutation({
    mutationFn: () =>
      updateResume({
        resumeId: props.resume.id,
        patch: {
          title,
          profile: { fullName, headline, summary },
          sections: {
            skills: skills
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          },
        },
      }),
    onSuccess: props.onSaved,
  })
  return (
    <Modal title="Edit Resume" onClose={props.onClose}>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Full name
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </label>
      <label>
        Headline
        <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
      </label>
      <label>
        Summary
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label>
        Skills
        <input value={skills} onChange={(event) => setSkills(event.target.value)} />
      </label>
      {mutation.error ? <div className="errorText">{mutation.error.message}</div> : null}
      <button
        type="button"
        disabled={!title.trim() || !fullName.trim()}
        onClick={() => mutation.mutate()}
      >
        Save Changes
      </button>
    </Modal>
  )
}

function StyleModal(props: { resume: ResumeDocument; onClose: () => void; onSaved: () => void }) {
  const [styleCss, setStyleCss] = useState(props.resume.styleCss)
  const mutation = useMutation({
    mutationFn: () => updateResumeStyle({ resumeId: props.resume.id, styleCss }),
    onSuccess: props.onSaved,
  })
  return (
    <Modal title="Update Style" onClose={props.onClose}>
      <label>
        CSS declarations for the resume page
        <textarea
          className="cssBox"
          value={styleCss}
          onChange={(event) => setStyleCss(event.target.value)}
        />
      </label>
      {mutation.error ? <div className="errorText">{mutation.error.message}</div> : null}
      <button type="button" onClick={() => mutation.mutate()}>
        Save Style
      </button>
    </Modal>
  )
}

function Modal(props: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modalBackdrop">
      <div className="modalPanel" role="dialog" aria-modal="true">
        <button className="iconButton" type="button" aria-label="Close" onClick={props.onClose}>
          <X />
        </button>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
