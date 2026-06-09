import { ShadowBridge, shadowServerAppMountedPath } from '@shadowob/sdk/bridge'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { createContext, StrictMode, useContext, useEffect, useMemo, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SkillRecord, SkillSummary } from '../types.js'
import {
  type BuddyInbox,
  getSkill,
  installSkill,
  listInboxes,
  listSkills,
  uploadSkill,
} from './api.js'
import './styles.css'

const queryClient = new QueryClient()

type LeaderboardMode = 'all' | 'trending' | 'hot'

type LibrarySearch = {
  q?: string
  mode?: LeaderboardMode
}

interface Notice {
  kind: 'success' | 'error'
  message: string
}

interface SkillsContextValue {
  inboxes: BuddyInbox[]
  selectedBuddy: BuddyInbox | null
  selectedBuddyId: string
  setSelectedBuddyId: (value: string) => void
  installBusy: boolean
  installDisabled: boolean
  notice: Notice | null
  setNotice: (value: Notice | null) => void
  installToBuddy: (skill: SkillSummary | SkillRecord) => void
}

const SkillsContext = createContext<SkillsContextValue | null>(null)

function useSkillsContext() {
  const value = useContext(SkillsContext)
  if (!value) throw new Error('SkillsContext is missing')
  return value
}

function buddyLabel(inbox: BuddyInbox | null | undefined) {
  const user = inbox?.agent.user
  return user?.displayName || user?.username || inbox?.agent.id || 'Buddy'
}

function validateLibrarySearch(search: Record<string, unknown>): LibrarySearch {
  const mode = search.mode === 'trending' || search.mode === 'hot' ? search.mode : 'all'
  return {
    q: typeof search.q === 'string' ? search.q : undefined,
    mode,
  }
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk))
  }
  return btoa(binary)
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])
  return debounced
}

function AppShell() {
  const routeState = useRouterState()
  const [selectedBuddyId, setSelectedBuddyId] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)

  const inboxesQuery = useQuery({
    queryKey: ['inboxes'],
    queryFn: listInboxes,
    staleTime: 30_000,
  })

  const inboxes = inboxesQuery.data?.inboxes ?? []
  const selectedBuddy =
    inboxes.find((inbox) => inbox.agent.id === selectedBuddyId) ?? inboxes[0] ?? null

  useEffect(() => {
    if (!selectedBuddyId && inboxes[0]) setSelectedBuddyId(inboxes[0].agent.id)
  }, [inboxes, selectedBuddyId])

  const installMutation = useMutation({
    mutationFn: (skill: SkillSummary | SkillRecord) => {
      if (!selectedBuddy) throw new Error('Choose a Buddy first')
      return installSkill({
        skillId: skill.id,
        targetBuddyAgentId: selectedBuddy.agent.id,
        targetBuddyUserId: selectedBuddy.agent.user?.id,
        targetBuddyLabel: buddyLabel(selectedBuddy),
      })
    },
    onSuccess: async (result) => {
      const delivery = ShadowBridge.inboxDeliveries(result)[0]
      const error = ShadowBridge.inboxErrors(result)[0]
      if (delivery?.messageId || delivery?.pendingId) {
        setNotice({
          kind: 'success',
          message: delivery.pendingId
            ? `${result.skill.name} is waiting for Inbox approval`
            : `${result.skill.name} sent to ${buddyLabel(selectedBuddy)}`,
        })
      } else {
        setNotice({
          kind: 'error',
          message: error?.error || `${result.skill.name} did not create an Inbox task`,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
    onError: (error) =>
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Install failed',
      }),
  })

  const contextValue = useMemo<SkillsContextValue>(
    () => ({
      inboxes,
      selectedBuddy,
      selectedBuddyId,
      setSelectedBuddyId,
      installBusy: installMutation.isPending,
      installDisabled: !selectedBuddy,
      notice,
      setNotice,
      installToBuddy: (skill) => installMutation.mutate(skill),
    }),
    [inboxes, installMutation, notice, selectedBuddy, selectedBuddyId],
  )

  const isShare = routeState.location.pathname.endsWith('/share')

  return (
    <SkillsContext.Provider value={contextValue}>
      <main className="skills-shell">
        <header className="site-header">
          <Link to="/" search={{}} className="brand">
            <span className="vercel-mark" aria-hidden />
            <span className="slash">/</span>
            <span>Skills</span>
          </Link>
          <nav className="site-nav" aria-label="Skills navigation">
            <Link to="/" search={{}} activeProps={{ className: 'active' }}>
              Topics
            </Link>
            <Link to="/" search={{ mode: 'trending' }} activeProps={{ className: 'active' }}>
              Official
            </Link>
            <Link to="/" search={{ mode: 'hot' }} activeProps={{ className: 'active' }}>
              Audits
            </Link>
            <Link to="/share" activeProps={{ className: isShare ? 'active' : '' }}>
              Share
            </Link>
          </nav>
          <label className="buddy-picker">
            <span>Install to</span>
            <select
              value={selectedBuddy?.agent.id ?? ''}
              onChange={(event) => setSelectedBuddyId(event.target.value)}
            >
              {inboxes.length === 0 ? <option value="">No Buddy Inbox</option> : null}
              {inboxes.map((inbox) => (
                <option key={inbox.agent.id} value={inbox.agent.id}>
                  {buddyLabel(inbox)}
                </option>
              ))}
            </select>
          </label>
        </header>

        {notice ? (
          <div className={`notice ${notice.kind}`} role="status">
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        <Outlet />
      </main>
    </SkillsContext.Provider>
  )
}

function LibraryPage() {
  const navigate = useNavigate()
  const search = indexRoute.useSearch()
  const mode = search.mode ?? 'all'
  const [searchInput, setSearchInput] = useState(search.q ?? '')
  const debouncedQuery = useDebouncedValue(searchInput.trim(), 400)
  const skillsQuery = useQuery({
    queryKey: ['skills', debouncedQuery],
    queryFn: () => listSkills({ q: debouncedQuery || undefined, limit: 120 }),
    staleTime: 1000 * 60 * 5,
  })
  const { installBusy, installDisabled, installToBuddy } = useSkillsContext()
  const skills = useMemo(
    () => rankSkills(skillsQuery.data?.skills ?? [], mode),
    [skillsQuery.data?.skills, mode],
  )
  const totalInstalls = useMemo(
    () => skills.reduce((sum, skill) => sum + (skill.external?.installs ?? skill.installCount), 0),
    [skills],
  )

  useEffect(() => {
    setSearchInput(search.q ?? '')
  }, [search.q])

  useEffect(() => {
    if ((search.q ?? '') === debouncedQuery) return
    navigate({
      to: '/',
      search: { q: debouncedQuery || undefined, mode },
      replace: true,
    })
  }, [debouncedQuery, mode, navigate, search.q])

  const setMode = (nextMode: LeaderboardMode) => {
    navigate({ to: '/', search: { q: debouncedQuery || undefined, mode: nextMode } })
  }

  return (
    <section className="leaderboard-page">
      <div className="leaderboard-heading">
        <p>SKILLS LEADERBOARD</p>
        <label className="leaderboard-search">
          <span aria-hidden>⌕</span>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search skills."
          />
          <kbd>/</kbd>
        </label>
      </div>

      <div className="leaderboard-tabs" role="tablist" aria-label="Leaderboard view">
        <button
          type="button"
          className={mode === 'all' ? 'active' : ''}
          onClick={() => setMode('all')}
        >
          All Time <span>({formatCount(totalInstalls)})</span>
        </button>
        <button
          type="button"
          className={mode === 'trending' ? 'active' : ''}
          onClick={() => setMode('trending')}
        >
          Trending <span>(24h)</span>
        </button>
        <button
          type="button"
          className={mode === 'hot' ? 'active' : ''}
          onClick={() => setMode('hot')}
        >
          Hot
        </button>
      </div>

      <div className="leaderboard-table">
        <div className="leaderboard-row table-head">
          <span>#</span>
          <span>SKILL</span>
          <span>8W TREND</span>
          <span>INSTALLS</span>
          <span />
        </div>
        {skillsQuery.isLoading || skillsQuery.isFetching ? (
          <div className="empty-row">
            {debouncedQuery ? 'Searching skills.' : 'Loading skills.'}
          </div>
        ) : null}
        {skills.map((skill, index) => (
          <SkillLeaderboardRow
            key={skill.id}
            rank={index + 1}
            skill={skill}
            installBusy={installBusy}
            installDisabled={installDisabled}
            onOpen={() => navigate({ to: '/skills/$skillId', params: { skillId: skill.id } })}
            onInstall={() => installToBuddy(skill)}
          />
        ))}
        {!skillsQuery.isLoading && skills.length === 0 ? (
          <div className="empty-row">No skills found.</div>
        ) : null}
      </div>
    </section>
  )
}

function SkillLeaderboardRow({
  rank,
  skill,
  installBusy,
  installDisabled,
  onOpen,
  onInstall,
}: {
  rank: number
  skill: SkillSummary
  installBusy: boolean
  installDisabled: boolean
  onOpen: () => void
  onInstall: () => void
}) {
  return (
    <div
      className="leaderboard-row skill-result-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
    >
      <span className="rank">{rank}</span>
      <span className="skill-cell">
        <strong>{skill.name}</strong>
        <small>{sourceName(skill)}</small>
      </span>
      <span className="trend-cell">
        <Sparkline values={skill.external?.weeklyInstalls ?? []} />
      </span>
      <span className="installs-cell">
        {formatCount(skill.external?.installs ?? skill.installCount)}
      </span>
      <span className="row-action">
        <button
          type="button"
          className="install-action"
          disabled={installBusy || installDisabled}
          onClick={(event) => {
            event.stopPropagation()
            if (!installBusy && !installDisabled) onInstall()
          }}
        >
          Install
        </button>
      </span>
    </div>
  )
}

function SkillDetailPage() {
  const { skillId } = detailRoute.useParams()
  const { installBusy, installDisabled, installToBuddy } = useSkillsContext()
  const detailQuery = useQuery({
    queryKey: ['skill', skillId],
    queryFn: () => getSkill(skillId),
  })
  const skill = detailQuery.data ?? null
  const entry = skill?.files.find((file) => file.path === skill.entrypoint) ?? skill?.files[0]
  const installCommand = skill ? installationCommand(skill) : ''

  if (detailQuery.isLoading)
    return <section className="detail-page empty-row">Loading skill.</section>
  if (!skill) return <section className="detail-page empty-row">Skill not found.</section>

  const preview =
    entry?.encoding === 'base64'
      ? `Binary file (${entry.contentType}, ${formatBytes(entry.sizeBytes)})`
      : (entry?.content ?? '')

  return (
    <section className="skill-detail-layout">
      <main className="skill-detail-main">
        <nav className="breadcrumbs" aria-label="Breadcrumbs">
          <Link to="/" search={{}}>
            skills
          </Link>
          <span>/</span>
          <span>{sourceName(skill)}</span>
          <span>/</span>
          <span>{skill.name}</span>
        </nav>

        <header className="skill-title-block">
          <h1>{skill.name}</h1>
          <span>{primaryTag(skill)}</span>
        </header>

        <section className="detail-section">
          <h2>INSTALLATION</h2>
          <div className="command-box">
            <span>$</span>
            <code>{installCommand}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(installCommand)}
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            className="detail-install"
            disabled={installBusy || installDisabled}
            onClick={() => installToBuddy(skill)}
          >
            Install to Buddy
          </button>
        </section>

        <section className="detail-section">
          <h2>SUMMARY</h2>
          <div className="summary-panel">
            <p>{skill.description}</p>
            <ul>
              <li>Downloads through the Skills App as a complete zip package.</li>
              <li>Installs by dispatching an Inbox task to the selected Buddy.</li>
              <li>Preserves SKILL.md and supporting files for multi-file skill packages.</li>
            </ul>
          </div>
        </section>

        <section className="detail-section">
          <h2>SKILL.md</h2>
          <MarkdownPreview content={preview} />
        </section>
      </main>

      <aside className="skill-detail-aside">
        <StatBlock label="INSTALLS" value={formatCount(displayInstallCount(skill))} />
        <Sparkline values={skill.external?.weeklyInstalls ?? []} large />
        <StatBlock label="REPOSITORY" value={sourceName(skill)} />
        <StatBlock label="FIRST SEEN" value={formatDate(skill.sharedAt)} />
        <StatBlock label="UPDATED" value={formatDate(skill.updatedAt)} />
        <div className="audit-block">
          <h3>SOURCE</h3>
          <span>{skill.source.label ?? skill.source.kind}</span>
          {skill.source.url ? (
            <a href={skill.source.url} target="_blank" rel="noreferrer">
              Open source
            </a>
          ) : null}
        </div>
      </aside>
    </section>
  )
}

function SharePage() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const { setNotice } = useSkillsContext()
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a zip or markdown file')
      return uploadSkill({
        filename: file.name,
        contentType: file.type || guessContentType(file.name),
        contentBase64: await fileToBase64(file),
      })
    },
    onSuccess: async ({ skill }) => {
      setNotice({ kind: 'success', message: `${skill.name} shared` })
      await queryClient.invalidateQueries({ queryKey: ['skills'] })
      await queryClient.invalidateQueries({ queryKey: ['skill', skill.id] })
      navigate({ to: '/skills/$skillId', params: { skillId: skill.id } })
    },
    onError: (error) =>
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      }),
  })

  const chooseFile = (next: File | undefined | null) => {
    if (!next) return
    setFile(next)
  }

  return (
    <section className="share-page">
      <div className="share-copy">
        <p>SHARE A SKILL</p>
        <h1>Upload a skill package.</h1>
      </div>
      <label
        className={dragging ? 'drop-zone dragging' : 'drop-zone'}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          chooseFile(event.dataTransfer.files[0])
        }}
      >
        <input
          type="file"
          accept=".zip,.md,application/zip,application/x-zip-compressed,text/markdown,text/plain"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />
        <span className="drop-title">{file ? file.name : 'Drop zip or SKILL.md'}</span>
        <span className="drop-copy">
          {file
            ? formatBytes(file.size)
            : 'A complete package can include references, scripts, assets, and examples.'}
        </span>
      </label>

      <button
        type="button"
        className="share-submit"
        onClick={() => uploadMutation.mutate()}
        disabled={!file || uploadMutation.isPending}
      >
        {uploadMutation.isPending ? 'Uploading' : 'Publish'}
      </button>
    </section>
  )
}

function rankSkills(skills: SkillSummary[], mode: LeaderboardMode) {
  const ranked = [...skills]
  if (mode === 'trending') {
    return ranked.sort((a, b) => weeklyTotal(b) - weeklyTotal(a))
  }
  if (mode === 'hot') {
    return ranked.sort((a, b) => latestWeekly(b) - latestWeekly(a))
  }
  return ranked.sort(
    (a, b) => (b.external?.installs ?? b.installCount) - (a.external?.installs ?? a.installCount),
  )
}

function weeklyTotal(skill: SkillSummary) {
  return (skill.external?.weeklyInstalls ?? []).reduce((sum, value) => sum + value, 0)
}

function latestWeekly(skill: SkillSummary) {
  return skill.external?.weeklyInstalls?.at(-1) ?? 0
}

function sourceName(skill: SkillSummary | SkillRecord) {
  return skill.external?.source ?? skill.source.label ?? skill.sharedBy.displayName
}

function displayInstallCount(skill: SkillSummary | SkillRecord) {
  if (skill.external?.installs !== undefined) return skill.external.installs
  return 'installCount' in skill ? skill.installCount : 0
}

function primaryTag(skill: SkillSummary | SkillRecord) {
  if (skill.tags.includes('official')) return 'Official'
  if (skill.tags.includes('hot')) return 'Hot'
  return skill.tags[0] ?? 'Agent workflows'
}

function installationCommand(skill: SkillSummary | SkillRecord) {
  return (
    skill.external?.installCommand ?? `skills skills.download --input '{"skillId":"${skill.id}"}'`
  )
}

function Sparkline({ values, large = false }: { values: number[]; large?: boolean }) {
  const normalized = values.length > 1 ? values : [0, 0, 0, 0, 0, 0, 0, 0]
  const width = large ? 180 : 118
  const height = large ? 72 : 34
  const max = Math.max(...normalized, 1)
  const min = Math.min(...normalized, 0)
  const range = Math.max(max - min, 1)
  const points = normalized
    .map((value, index) => {
      const x = (index / Math.max(normalized.length - 1, 1)) * width
      const y = height - ((value - min) / range) * (height - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      className={large ? 'sparkline large' : 'sparkline'}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <polyline points={points} fill="none" />
    </svg>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content
    .replace(/^---[\s\S]*?\n---\s*/u, '')
    .split(/\r?\n/u)
    .slice(0, 120)
  return (
    <article className="markdown-preview">
      {lines.map((line, index) => {
        const key = `${index}-${line}`
        if (!line.trim()) return <br key={key} />
        if (line.startsWith('# ')) return <h1 key={key}>{line.slice(2)}</h1>
        if (line.startsWith('## ')) return <h2 key={key}>{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={key}>{line.slice(4)}</h3>
        if (/^[-*]\s+/u.test(line)) return <li key={key}>{line.replace(/^[-*]\s+/u, '')}</li>
        if (/^\d+\.\s+/u.test(line)) return <li key={key}>{line.replace(/^\d+\.\s+/u, '')}</li>
        if (line.startsWith('```')) return null
        return <p key={key}>{line}</p>
      })}
    </article>
  )
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-block">
      <h3>{label}</h3>
      <strong>{value}</strong>
    </div>
  )
}

function guessContentType(filename: string) {
  return filename.toLowerCase().endsWith('.zip') ? 'application/zip' : 'text/markdown'
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

const rootRoute = createRootRoute({
  component: AppShell,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: validateLibrarySearch,
  component: LibraryPage,
})

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/skills/$skillId',
  component: SkillDetailPage,
})

const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share',
  component: SharePage,
})

const routeTree = rootRoute.addChildren([indexRoute, detailRoute, shareRoute])
const router = createRouter({ routeTree, basepath: shadowServerAppMountedPath('/shadow/server') })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root') as HTMLElement
const skillsWindow = window as Window & { __shadowSkillsRoot?: Root }
skillsWindow.__shadowSkillsRoot ??= createRoot(rootElement)
skillsWindow.__shadowSkillsRoot.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
