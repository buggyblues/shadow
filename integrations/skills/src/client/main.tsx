import {
  getShadowSpaceAppInboxDeliveries,
  getShadowSpaceAppInboxErrors,
  shadowSpaceAppMountedPath,
} from '@shadowob/sdk/bridge'
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
import { marked } from 'marked'
import { createContext, StrictMode, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SkillRecord, SkillSummary } from '../types.js'
import {
  type BuddyInbox,
  bridgeAvailable,
  getSkill,
  installSkill,
  listInboxes,
  listSkills,
  openBridgeBuddyCreator,
  openInstallCopilot,
  uploadSkill,
} from './api.js'
import { t } from './i18n.js'
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
  installBusy: boolean
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

function createdBuddyAgentId(result: unknown) {
  if (!result || typeof result !== 'object') return null
  const agent = (result as { agent?: unknown }).agent
  if (!agent || typeof agent !== 'object') return null
  const id = (agent as { id?: unknown }).id
  return typeof id === 'string' ? id : null
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
  const [pendingInstallSkill, setPendingInstallSkill] = useState<SkillSummary | SkillRecord | null>(
    null,
  )
  const [notice, setNotice] = useState<Notice | null>(null)
  const previousBuddyIdsRef = useRef<Set<string>>(new Set())

  const inboxesQuery = useQuery({
    queryKey: ['inboxes'],
    queryFn: () => listInboxes(),
    staleTime: 30_000,
  })

  const inboxes = inboxesQuery.data?.inboxes ?? []
  const selectedBuddy =
    inboxes.find((inbox) => inbox.agent.id === selectedBuddyId) ?? inboxes[0] ?? null

  const refreshInboxes = async () => {
    const refreshed = await listInboxes({ refresh: true })
    queryClient.setQueryData(['inboxes'], refreshed)
    return refreshed
  }

  useEffect(() => {
    if (!selectedBuddyId && inboxes[0]) setSelectedBuddyId(inboxes[0].agent.id)
  }, [inboxes, selectedBuddyId])

  useEffect(() => {
    if (!pendingInstallSkill) return
    previousBuddyIdsRef.current = new Set(inboxes.map((inbox) => inbox.agent.id))
    void refreshInboxes().then((refreshed) => {
      if (!selectedBuddyId && refreshed.inboxes[0])
        setSelectedBuddyId(refreshed.inboxes[0].agent.id)
    })
  }, [pendingInstallSkill?.id])

  const createBuddyMutation = useMutation({
    mutationFn: openBridgeBuddyCreator,
    onSuccess: async (result) => {
      const createdAgentId = createdBuddyAgentId(result)
      const refreshed = await refreshInboxes()
      const fallbackAgentId = refreshed.inboxes.find(
        (inbox) => !previousBuddyIdsRef.current.has(inbox.agent.id),
      )?.agent.id
      const nextAgentId = createdAgentId ?? fallbackAgentId
      if (nextAgentId) setSelectedBuddyId(nextAgentId)
    },
    onError: (error) =>
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      }),
  })

  const installMutation = useMutation({
    mutationFn: (input: { skill: SkillSummary | SkillRecord; buddy: BuddyInbox }) => {
      return installSkill({
        skillId: input.skill.id,
        targetBuddyAgentId: input.buddy.agent.id,
        targetBuddyUserId: input.buddy.agent.user?.id,
        targetBuddyLabel: buddyLabel(input.buddy),
        targetInboxChannelId: input.buddy.channel?.id ?? undefined,
      })
    },
    onSuccess: async (result, input) => {
      const delivery = getShadowSpaceAppInboxDeliveries(result)[0]
      const error = getShadowSpaceAppInboxErrors(result)[0]
      if (delivery?.messageId || delivery?.pendingId) {
        setPendingInstallSkill(null)
        if (delivery.messageId || delivery.taskId || delivery.cardId) {
          void openInstallCopilot(delivery)
        }
        setNotice({
          kind: 'success',
          message: delivery.pendingId
            ? t('install.waitingApproval', { skill: result.skill.name })
            : t('install.sent', { skill: result.skill.name, buddy: buddyLabel(input.buddy) }),
        })
      } else if (error?.error) {
        setNotice({
          kind: 'error',
          message: error.error,
        })
      } else {
        setNotice({
          kind: 'error',
          message: t('install.noDelivery', { skill: result.skill.name }),
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
      installBusy: installMutation.isPending,
      notice,
      setNotice,
      installToBuddy: (skill) => setPendingInstallSkill(skill),
    }),
    [installMutation.isPending, notice],
  )

  const isShare = routeState.location.pathname.endsWith('/share')
  const confirmInstall = () => {
    if (!pendingInstallSkill) return
    if (!selectedBuddy) {
      setNotice({ kind: 'error', message: t('install.chooseBuddyFirst') })
      return
    }
    installMutation.mutate({ skill: pendingInstallSkill, buddy: selectedBuddy })
  }

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
            <Link to="/" search={{}} className={isShare ? '' : 'active'}>
              {t('nav.browse')}
            </Link>
            <Link to="/share" className={isShare ? 'active' : ''}>
              {t('nav.share')}
            </Link>
          </nav>
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
        <InstallBuddyDialog
          skill={pendingInstallSkill}
          inboxes={inboxes}
          inboxesLoading={inboxesQuery.isLoading}
          selectedBuddyId={selectedBuddy?.agent.id ?? ''}
          canCreateBuddy={bridgeAvailable()}
          createBuddyBusy={createBuddyMutation.isPending}
          installBusy={installMutation.isPending}
          onSelectBuddy={setSelectedBuddyId}
          onCreateBuddy={() => createBuddyMutation.mutate()}
          onRefreshBuddies={() => void refreshInboxes()}
          onCancel={() => {
            if (!installMutation.isPending) setPendingInstallSkill(null)
          }}
          onConfirm={confirmInstall}
        />
      </main>
    </SkillsContext.Provider>
  )
}

function InstallBuddyDialog({
  skill,
  inboxes,
  inboxesLoading,
  selectedBuddyId,
  canCreateBuddy,
  createBuddyBusy,
  installBusy,
  onSelectBuddy,
  onCreateBuddy,
  onRefreshBuddies,
  onCancel,
  onConfirm,
}: {
  skill: SkillSummary | SkillRecord | null
  inboxes: BuddyInbox[]
  inboxesLoading: boolean
  selectedBuddyId: string
  canCreateBuddy: boolean
  createBuddyBusy: boolean
  installBusy: boolean
  onSelectBuddy: (value: string) => void
  onCreateBuddy: () => void
  onRefreshBuddies: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    if (!skill) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !installBusy) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [installBusy, onCancel, skill])

  if (!skill) return null

  const hasBuddies = inboxes.length > 0
  const method = isNpxSkillsSkill(skill) ? 'npx' : 'zip'

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !installBusy) onCancel()
      }}
    >
      <section
        className="install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-dialog-title"
      >
        <header>
          <p>{t('install.title')}</p>
          <h2 id="install-dialog-title">{skill.name}</h2>
        </header>

        <div className="install-dialog-body">
          <label className="install-buddy-picker">
            <span>{t('install.buddyLabel')}</span>
            {inboxesLoading ? (
              <div className="select-loading" role="status">
                {t('install.loadingBuddies')}
              </div>
            ) : (
              <select
                value={selectedBuddyId}
                onChange={(event) => onSelectBuddy(event.target.value)}
                disabled={!hasBuddies || installBusy}
              >
                {hasBuddies ? null : <option value="">{t('install.noBuddyInbox')}</option>}
                {inboxes.map((inbox) => (
                  <option key={inbox.agent.id} value={inbox.agent.id}>
                    {buddyLabel(inbox)}
                  </option>
                ))}
              </select>
            )}
          </label>
          <div className="install-buddy-actions">
            <button type="button" onClick={onRefreshBuddies} disabled={installBusy}>
              {t('install.refreshBuddies')}
            </button>
            <button
              type="button"
              onClick={onCreateBuddy}
              disabled={!canCreateBuddy || createBuddyBusy || installBusy}
            >
              {createBuddyBusy ? t('install.creatingBuddy') : t('install.createBuddy')}
            </button>
          </div>

          <div className="install-method">
            <span>
              {method === 'npx' ? t('install.methodNpxLabel') : t('install.methodZipLabel')}
            </span>
            <p>{method === 'npx' ? t('install.methodNpxBody') : t('install.methodZipBody')}</p>
            <code>{installationCommand(skill)}</code>
          </div>
        </div>

        <div className="install-dialog-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={onCancel}
            disabled={installBusy}
          >
            {t('install.cancel')}
          </button>
          <button
            type="button"
            className="install-action"
            onClick={onConfirm}
            disabled={!hasBuddies || inboxesLoading || installBusy}
          >
            {installBusy ? t('install.sending') : t('install.sendTask')}
          </button>
        </div>
      </section>
    </div>
  )
}

function LibraryPage() {
  const navigate = useNavigate()
  const search = indexRoute.useSearch()
  const mode = search.mode ?? 'all'
  const [searchInput, setSearchInput] = useState(search.q ?? '')
  const lastNavigatedQuery = useRef(search.q ?? '')
  const debouncedQuery = useDebouncedValue(searchInput.trim(), 400)
  const skillsQuery = useQuery({
    queryKey: ['skills', debouncedQuery],
    queryFn: () => listSkills({ q: debouncedQuery || undefined, limit: 120 }),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 5,
  })
  const { installBusy, installToBuddy } = useSkillsContext()
  const skills = useMemo(
    () => rankSkills(skillsQuery.data?.skills ?? [], mode),
    [skillsQuery.data?.skills, mode],
  )
  const loadingMessage = debouncedQuery
    ? t('search.loadingWithQuery', { query: debouncedQuery })
    : t('search.loading')
  const showLoadingRows = skillsQuery.isLoading || (skillsQuery.isFetching && skills.length === 0)
  const totalInstalls = useMemo(
    () => skills.reduce((sum, skill) => sum + (skill.external?.installs ?? skill.installCount), 0),
    [skills],
  )

  useEffect(() => {
    const nextQuery = search.q ?? ''
    if (nextQuery === lastNavigatedQuery.current) return
    setSearchInput(nextQuery)
    lastNavigatedQuery.current = nextQuery
  }, [search.q])

  useEffect(() => {
    if ((search.q ?? '') === debouncedQuery) return
    lastNavigatedQuery.current = debouncedQuery
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
        <div className="search-status" role="status" aria-live="polite">
          {skillsQuery.isFetching ? loadingMessage : null}
        </div>
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

      <div
        className={
          skillsQuery.isFetching && !showLoadingRows
            ? 'leaderboard-table refreshing'
            : 'leaderboard-table'
        }
      >
        <div className="leaderboard-row table-head">
          <span>#</span>
          <span>SKILL</span>
          <span>8W TREND</span>
          <span>INSTALLS</span>
          <span />
        </div>
        {showLoadingRows ? (
          <SkillTableSkeleton label={loadingMessage} />
        ) : (
          skills.map((skill, index) => (
            <SkillLeaderboardRow
              key={skill.id}
              rank={index + 1}
              skill={skill}
              installBusy={installBusy}
              onOpen={() => navigate({ to: '/skills/$skillId', params: { skillId: skill.id } })}
              onInstall={() => installToBuddy(skill)}
            />
          ))
        )}
        {!showLoadingRows && !skillsQuery.isFetching && skills.length === 0 ? (
          <div className="empty-row">No skills found.</div>
        ) : null}
      </div>
    </section>
  )
}

function SkillTableSkeleton({ label }: { label: string }) {
  return (
    <>
      <div className="loading-row" role="status">
        <span>{label}</span>
      </div>
      {Array.from({ length: 6 }, (_, index) => (
        <div className="leaderboard-row skeleton-row" aria-hidden key={index}>
          <span className="skeleton-cell short" />
          <span className="skeleton-cell title" />
          <span className="skeleton-cell chart" />
          <span className="skeleton-cell count" />
          <span className="skeleton-cell button" />
        </div>
      ))}
    </>
  )
}

function SkillLeaderboardRow({
  rank,
  skill,
  installBusy,
  onOpen,
  onInstall,
}: {
  rank: number
  skill: SkillSummary
  installBusy: boolean
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
          disabled={installBusy}
          onClick={(event) => {
            event.stopPropagation()
            if (!installBusy) onInstall()
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
  const { installBusy, installToBuddy } = useSkillsContext()
  const detailQuery = useQuery({
    queryKey: ['skill', skillId],
    queryFn: () => getSkill(skillId),
    refetchOnMount: 'always',
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
  const externalDetails = skill.external?.details
  const directoryUrl = externalDetails?.sourceUrl ?? skill.external?.sourceUrl ?? skill.source.url
  const repositoryUrl = externalDetails?.repositoryUrl
  const audits = externalDetails?.audits ?? []

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
          <div className="detail-title-meta">
            <span>{primaryTag(skill)}</span>
            {directoryUrl ? (
              <a href={directoryUrl} target="_blank" rel="noreferrer">
                {t('detail.openDirectory')}
              </a>
            ) : null}
            {repositoryUrl ? (
              <a href={repositoryUrl} target="_blank" rel="noreferrer">
                {t('detail.openRepository')}
              </a>
            ) : null}
          </div>
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
            disabled={installBusy}
            onClick={() => installToBuddy(skill)}
          >
            Install to Buddy
          </button>
        </section>

        <section className="detail-section">
          <h2>SUMMARY</h2>
          <MarkdownPreview
            className="summary-panel"
            content={[
              externalDetails?.description ?? skill.description,
              '',
              ...installSummaryItems(skill).map((item) => `- ${item}`),
            ].join('\n')}
          />
          <div className="detail-meta-grid">
            <DetailMeta label={t('detail.source')} value={sourceName(skill)} href={directoryUrl} />
            <DetailMeta
              label={t('detail.repository')}
              value={externalDetails?.repository ?? sourceName(skill)}
              href={repositoryUrl}
            />
            <DetailMeta label={t('detail.files')} value={String(skill.files.length)} />
            <DetailMeta label={t('detail.commands')} value={String(skill.commandHints.length)} />
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
        {externalDetails?.githubStarsLabel ? (
          <StatBlock label={t('detail.githubStars')} value={externalDetails.githubStarsLabel} />
        ) : null}
        <SideInfoBlock
          label="REPOSITORY"
          value={externalDetails?.repository ?? sourceName(skill)}
          href={repositoryUrl}
        />
        <SideInfoBlock
          label="FIRST SEEN"
          value={externalDetails?.firstSeen ?? formatDate(skill.sharedAt)}
        />
        <SideInfoBlock label="UPDATED" value={formatDate(skill.updatedAt)} />
        {audits.length ? (
          <div className="audit-block">
            <h3>{t('detail.audits')}</h3>
            <div className="audit-list">
              {audits.map((audit) => (
                <a
                  key={`${audit.name}-${audit.url ?? audit.status}`}
                  href={audit.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{audit.name}</span>
                  <strong>{audit.status}</strong>
                </a>
              ))}
            </div>
          </div>
        ) : null}
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

function isNpxSkillsSkill(skill: SkillSummary | SkillRecord) {
  return skill.source.kind === 'skills_sh' || skill.external?.directory === 'skills.sh'
}

function installSummaryItems(skill: SkillSummary | SkillRecord) {
  if (isNpxSkillsSkill(skill)) {
    return [t('summary.npx.runtime'), t('summary.npx.noZip'), t('summary.npx.reply')]
  }
  return [t('summary.zip.download'), t('summary.zip.dispatch'), t('summary.zip.preserve')]
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

function stripMarkdownFrontmatter(content: string) {
  return content.replace(/^---[\s\S]*?\n---\s*/u, '').trim()
}

function sanitizeMarkdownHtml(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  const allowedTags = new Set([
    'a',
    'blockquote',
    'br',
    'code',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'hr',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul',
  ])

  const sanitizeChildren = (parent: ParentNode) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove()
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const element = child as HTMLElement
      const tag = element.tagName.toLowerCase()
      if (!allowedTags.has(tag)) {
        element.remove()
        continue
      }
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase()
        const value = attribute.value
        if (tag === 'a' && name === 'href') {
          try {
            const url = new URL(value, window.location.origin)
            if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
              element.removeAttribute(attribute.name)
            }
          } catch {
            element.removeAttribute(attribute.name)
          }
          continue
        }
        element.removeAttribute(attribute.name)
      }
      if (tag === 'a' && element.getAttribute('href')) {
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noreferrer')
      }
      sanitizeChildren(element)
    }
  }

  sanitizeChildren(template.content)
  return template.innerHTML
}

function markdownToHtml(content: string) {
  const html = marked.parse(stripMarkdownFrontmatter(content), {
    async: false,
    breaks: false,
    gfm: true,
  }) as string
  return sanitizeMarkdownHtml(html)
}

function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => markdownToHtml(content), [content])
  return (
    <article
      className={className ? `markdown-preview ${className}` : 'markdown-preview'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
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

function SideInfoBlock({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="side-info-block">
      <h3>{label}</h3>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  )
}

function DetailMeta({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="detail-meta-item">
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : (
        <strong>{value}</strong>
      )}
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
const router = createRouter({ routeTree, basepath: shadowSpaceAppMountedPath('/shadow/server') })

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
