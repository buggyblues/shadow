import { Editor as MonacoEditor } from '@monaco-editor/react'
import { ShadowBridge } from '@shadowob/sdk/bridge'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import clsx from 'clsx'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileText,
  History,
  Lightbulb,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Target,
  TerminalSquare,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  Challenge,
  CodeSubmission,
  SubmissionCoachingFocus,
  SubmissionReviewFocus,
  TrainerLanguage,
  TrainerOverview,
  TrainerSettings,
} from '../types.js'
import {
  type BuddyInboxOption,
  createSubmission,
  getChallenge,
  getLearningOverview,
  getSubmission,
  type InboxDelivery,
  type InboxDeliveryError,
  importProblemSource,
  listBuddyInboxes,
  listChallenges,
  listSubmissions,
  type ProblemSource,
  searchProblemSources,
  subscribeTrainerEvents,
  updateTrainerSettings,
} from './api.js'
import { configureMonacoWorkers } from './monaco.js'
import './styles.css'

configureMonacoWorkers()

type WorkspaceView = 'description' | 'submissions' | 'submission' | 'waiting'
type ConsoleView = 'testcase' | 'result'
type LanguageOption = {
  value: TrainerLanguage
  label: string
  monaco: string
}
type ReviewFocusOption = {
  value: SubmissionReviewFocus
  label: string
  hint: string
}
type ReviewDispatchStatus = 'delivered' | 'pending_approval' | 'error' | 'unconfirmed'
type ReviewDispatchNotice = {
  status: ReviewDispatchStatus
  reviewerLabel: string
  channelId?: string
  messageId?: string
  taskId?: string | null
  pendingId?: string | null
  error?: string
}
type ReviewFlowStepState = 'complete' | 'active' | 'waiting' | 'error'
type ProblemSourceProvider = ProblemSource['provider']

const queryClient = new QueryClient()
const languageOptions: LanguageOption[] = [
  { value: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { value: 'typescript', label: 'TypeScript', monaco: 'typescript' },
  { value: 'python', label: 'Python', monaco: 'python' },
]
const reviewerStorageKey = 'trainer:preferred-reviewer'
const reviewFocusStorageKey = 'trainer:review-focus'
const coachingFocusStorageKey = 'trainer:coaching-focuses'
const reviewDispatchStoragePrefix = 'trainer:review-dispatch:'
const hostNavigationRequestType = 'shadow.app.navigate'
const hostNavigationAckType = 'shadow.app.navigate.ack'
const reviewFocusOptions: ReviewFocusOption[] = [
  {
    value: 'standard',
    label: 'Sandbox review',
    hint: 'run cases and explain correctness',
  },
  {
    value: 'debug',
    label: 'Debug hints',
    hint: 'find the first failing state',
  },
  {
    value: 'interview',
    label: 'Interview coaching',
    hint: 'train explanation and follow-ups',
  },
  {
    value: 'complexity',
    label: 'Complexity review',
    hint: 'focus on tradeoffs and proof',
  },
]
const defaultReviewFocusOption = reviewFocusOptions[0] as ReviewFocusOption
const defaultCoachingFocuses: SubmissionCoachingFocus[] = [
  'reasoning',
  'edge_cases',
  'complexity',
  'communication',
]
const coachingFocusOptions: Array<{
  value: SubmissionCoachingFocus
  label: string
  hint: string
}> = [
  {
    value: 'reasoning',
    label: 'Reasoning',
    hint: 'invariant and proof path',
  },
  {
    value: 'edge_cases',
    label: 'Edge cases',
    hint: 'boundary inputs and counterexamples',
  },
  {
    value: 'complexity',
    label: 'Complexity',
    hint: 'time, space, and tradeoffs',
  },
  {
    value: 'communication',
    label: 'Communication',
    hint: 'clear spoken answer structure',
  },
  {
    value: 'follow_ups',
    label: 'Follow-ups',
    hint: 'realistic interview extensions',
  },
  {
    value: 'debugging',
    label: 'Debugging',
    hint: 'trace the first wrong state',
  },
]
const problemSourceOptions: Array<{
  value: ProblemSourceProvider
  label: string
  hint: string
}> = [
  {
    value: 'leetcode',
    label: 'LeetCode',
    hint: 'statements and examples via alfa-leetcode-api',
  },
  {
    value: 'codeforces',
    label: 'Codeforces',
    hint: 'official metadata plus mirror statements and samples',
  },
]
const defaultProblemSourceOption = problemSourceOptions[0] as (typeof problemSourceOptions)[number]
const problemSourcePageSize = 24

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ProblemsPage,
})

const problemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems',
  component: ProblemsPage,
})

const submissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/submissions',
  component: SubmissionsPage,
})

const learningRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/learning',
  component: LearningPage,
})

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: ImportPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const problemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId',
  component: ProblemRoutePage,
})

const problemSubmissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId/submissions',
  component: ProblemSubmissionsRoutePage,
})

const submissionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId/submissions/$submissionId',
  component: SubmissionDetailRoutePage,
})

const submissionWaitingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/problems/$challengeId/submissions/$submissionId/waiting',
  component: SubmissionWaitingRoutePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  problemsRoute,
  submissionsRoute,
  learningRoute,
  importRoute,
  settingsRoute,
  problemRoute,
  problemSubmissionsRoute,
  submissionDetailRoute,
  submissionWaitingRoute,
])

const router = createRouter({
  routeTree,
  history: createHashHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function RootLayout() {
  useTrainerRuntimeInvalidation()
  useTrainerHostNavigation()

  return (
    <div className="appShell">
      <header className="topbar">
        <Link className="brand" to="/problems">
          <span className="brandMark">
            <Code2 size={19} />
          </span>
          <span>
            <strong>Code Trainer</strong>
            <small>practice workspace</small>
          </span>
        </Link>
        <nav className="nav">
          <Link activeProps={{ className: 'active' }} to="/problems">
            Problems
          </Link>
          <Link activeProps={{ className: 'active' }} to="/submissions">
            Submissions
          </Link>
          <Link activeProps={{ className: 'active' }} to="/learning">
            Learning
          </Link>
          <Link activeProps={{ className: 'active' }} to="/import">
            Import
          </Link>
          <Link activeProps={{ className: 'active' }} to="/settings">
            Settings
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}

function ProblemRoutePage() {
  const { challengeId } = problemRoute.useParams()
  return <ProblemWorkspace challengeId={challengeId} view="description" />
}

function ProblemSubmissionsRoutePage() {
  const { challengeId } = problemSubmissionsRoute.useParams()
  return <ProblemWorkspace challengeId={challengeId} view="submissions" />
}

function SubmissionDetailRoutePage() {
  const { challengeId, submissionId } = submissionDetailRoute.useParams()
  return (
    <ProblemWorkspace challengeId={challengeId} submissionId={submissionId} view="submission" />
  )
}

function SubmissionWaitingRoutePage() {
  const { challengeId, submissionId } = submissionWaitingRoute.useParams()
  return <ProblemWorkspace challengeId={challengeId} submissionId={submissionId} view="waiting" />
}

function ProblemsPage() {
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState<Challenge['difficulty'] | 'all'>('all')
  const [tag, setTag] = useState('all')
  const tagsQuery = useQuery({
    queryKey: ['challenges', 'tag-options'],
    queryFn: () => listChallenges({}),
  })
  const challengesQuery = useQuery({
    queryKey: ['challenges', query, difficulty, tag],
    queryFn: () =>
      listChallenges({
        query: query.trim() || undefined,
        difficulty: difficulty === 'all' ? undefined : difficulty,
        tag: tag === 'all' ? undefined : tag,
      }),
  })
  const challenges = challengesQuery.data?.challenges ?? []
  const tagOptions = useMemo(
    () =>
      [
        ...new Set(
          (tagsQuery.data?.challenges ?? []).flatMap((challenge) =>
            visibleChallengeTags(challenge),
          ),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [tagsQuery.data?.challenges],
  )

  return (
    <main className="libraryPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">Problem set</p>
          <h1>Choose a challenge</h1>
        </div>
        <div className="librarySearch">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, tag, or prompt"
          />
        </div>
      </section>

      <div className="filterBar" aria-label="Difficulty">
        {(['all', 'easy', 'medium', 'hard'] as const).map((item) => (
          <button
            className={clsx('segmentedButton', difficulty === item && 'active')}
            key={item}
            type="button"
            onClick={() => setDifficulty(item)}
          >
            {item === 'all' ? 'All' : difficultyLabel(item)}
          </button>
        ))}
      </div>

      {tagOptions.length ? (
        <div className="tagFilterBar" aria-label="Problem type">
          <span>Type</span>
          <button
            className={clsx('segmentedButton', tag === 'all' && 'active')}
            type="button"
            onClick={() => setTag('all')}
          >
            All types
          </button>
          {tagOptions.map((item) => (
            <button
              className={clsx('segmentedButton', tag === item && 'active')}
              key={item}
              type="button"
              onClick={() => setTag(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      {challengesQuery.isLoading ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading problems" />
      ) : challenges.length ? (
        <section className="problemTable" aria-label="Problems">
          <div className="problemTableHeader">
            <span>#</span>
            <span>Title</span>
            <span>Source</span>
            <span>Tests</span>
            <span>Difficulty</span>
          </div>
          {challenges.map((challenge, index) => (
            <ProblemCard challenge={challenge} index={index} key={challenge.id} />
          ))}
        </section>
      ) : (
        <EmptyState icon={<BookOpen size={24} />} title="No problems found" />
      )}
    </main>
  )
}

function ProblemCard({ challenge, index }: { challenge: Challenge; index: number }) {
  return (
    <Link className="problemRow" params={{ challengeId: challenge.id }} to="/problems/$challengeId">
      <span className="problemNumber">{String(index + 1).padStart(3, '0')}</span>
      <span className="problemMeta">
        <strong>{challenge.title}</strong>
        <span>{visibleChallengeTags(challenge).join(', ') || 'general'}</span>
      </span>
      <span className="sourceBadge">{sourceLabel(challenge)}</span>
      <span className="caseCount">{caseCountLabel(challenge)}</span>
      <span className={clsx('difficultyBadge', challenge.difficulty)}>
        {difficultyLabel(challenge.difficulty)}
      </span>
    </Link>
  )
}

function LearningPage() {
  const overviewQuery = useQuery({
    queryKey: ['learning-overview'],
    queryFn: getLearningOverview,
  })
  const overview = overviewQuery.data?.overview

  return (
    <main className="learningPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">Training loop</p>
          <h1>Learning signals</h1>
        </div>
      </section>

      {overviewQuery.isLoading ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading learning state" />
      ) : overview ? (
        <div className="learningGrid">
          <LearningStats overview={overview} />
          <BuddySignalsPanel overview={overview} />
          <SkillsPanel overview={overview} />
          <RecentLearningPanel overview={overview} />
        </div>
      ) : (
        <EmptyState icon={<BarChart3 size={24} />} title="Learning state unavailable" />
      )}
    </main>
  )
}

const difficultyOptions: Array<{
  value: TrainerSettings['difficultyMode']
  label: string
  detail: string
}> = [
  { value: 'easy', label: 'Easy', detail: 'ACK > 75%' },
  { value: 'medium', label: 'Medium', detail: 'ACK 20%-75%' },
  { value: 'hard', label: 'Hard', detail: 'ACK 5%-20%' },
  { value: 'hell', label: 'Hell', detail: 'ACK < 5%' },
]

function SettingsPage() {
  const client = useQueryClient()
  const overviewQuery = useQuery({
    queryKey: ['learning-overview'],
    queryFn: getLearningOverview,
  })
  const settings = overviewQuery.data?.overview.settings
  const [difficultyMode, setDifficultyMode] = useState<TrainerSettings['difficultyMode']>('medium')
  const [targetProblems, setTargetProblems] = useState('20')
  const [deadlineAt, setDeadlineAt] = useState('')
  const saveSettings = useMutation({
    mutationFn: () =>
      updateTrainerSettings({
        difficultyMode,
        targetProblems: Number(targetProblems) || undefined,
        deadlineAt: deadlineAt ? new Date(deadlineAt).toISOString() : undefined,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['learning-overview'] })
    },
  })

  useEffect(() => {
    if (!settings) return
    setDifficultyMode(settings.difficultyMode)
    setTargetProblems(String(settings.targetProblems ?? 20))
    setDeadlineAt(settings.deadlineAt ? settings.deadlineAt.slice(0, 16) : '')
  }, [settings])

  return (
    <main className="learningPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">Adaptive loop</p>
          <h1>Learning settings</h1>
        </div>
      </section>
      <section className="settingsPanel">
        <PanelTitle icon={<Settings size={17} />} title="Difficulty control" />
        <div className="difficultyGrid">
          {difficultyOptions.map((option) => (
            <button
              className={clsx('difficultyOption', difficultyMode === option.value && 'active')}
              key={option.value}
              type="button"
              onClick={() => setDifficultyMode(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.detail}</span>
            </button>
          ))}
        </div>
        <PanelTitle icon={<Target size={17} />} title="Deadline target" />
        <div className="settingsFields">
          <label>
            <span>Target problems</span>
            <input
              min={1}
              max={999}
              type="number"
              value={targetProblems}
              onChange={(event) => setTargetProblems(event.target.value)}
            />
          </label>
          <label>
            <span>Deadline</span>
            <input
              type="datetime-local"
              value={deadlineAt}
              onChange={(event) => setDeadlineAt(event.target.value)}
            />
          </label>
          <button
            className="primaryAction"
            disabled={saveSettings.isPending}
            type="button"
            onClick={() => saveSettings.mutate()}
          >
            {saveSettings.isPending ? 'Saving' : 'Save settings'}
          </button>
        </div>
        {saveSettings.error ? <div className="errorText">{saveSettings.error.message}</div> : null}
      </section>
    </main>
  )
}

function LearningStats({ overview }: { overview: TrainerOverview }) {
  const ackRate =
    overview.stats.attemptedProblems > 0
      ? Math.round((overview.stats.acceptedProblems / overview.stats.attemptedProblems) * 100)
      : null
  const stats = [
    ['Problems', overview.stats.totalProblems],
    ['Attempted', overview.stats.attemptedProblems],
    ['Accepted', overview.stats.acceptedProblems],
    ['ACK rate', ackRate === null ? '--' : `${ackRate}%`],
    ['Pending reviews', overview.stats.pendingReviews],
    [
      'Target',
      overview.stats.targetProblems
        ? `${overview.stats.targetCompleted ?? 0}/${overview.stats.targetProblems}`
        : '--',
      overview.stats.daysRemaining !== undefined
        ? `${overview.stats.daysRemaining} days left`
        : undefined,
    ],
  ] as const

  return (
    <section className="learningStats">
      {stats.map(([label, value, detail]) => (
        <div className="learningMetric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          {detail ? <small>{detail}</small> : null}
        </div>
      ))}
    </section>
  )
}

function BuddySignalsPanel({ overview }: { overview: TrainerOverview }) {
  const latestRecommendation = overview.recommendations[0]
  const latestReport = overview.reports[0]
  const latestTip = overview.tips[0]
  const dueReviews = overview.wrongProblems.length
  const recommendationHref = latestRecommendation?.appPath
    ? `#${latestRecommendation.appPath}`
    : latestRecommendation
      ? `#/problems/${latestRecommendation.challengeId}`
      : null

  return (
    <section className="learningPanel learningPanelWide">
      <PanelTitle icon={<Bot size={17} />} title="Buddy signals" />
      <div className="signalGrid">
        <SignalCard
          label="Next recommendation"
          value={latestRecommendation?.challengeTitle ?? 'Waiting'}
          detail={
            latestRecommendation
              ? [
                  latestRecommendation.strategy
                    ? recommendationStrategyLabel(latestRecommendation.strategy)
                    : null,
                  typeof latestRecommendation.predictedAckRate === 'number'
                    ? `ACK ${latestRecommendation.predictedAckRate}%`
                    : null,
                  latestRecommendation.reason,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'No recommendation recorded'
          }
          href={recommendationHref}
        />
        <SignalCard
          label="Due reviews"
          value={dueReviews}
          detail={
            dueReviews
              ? overview.wrongProblems[0]?.challengeTitle
              : 'No wrong-problem review scheduled'
          }
        />
        <SignalCard
          label="Tips logged"
          value={overview.tips.length}
          detail={latestTip?.title ?? 'No tip recorded'}
        />
        <SignalCard
          label="Reports logged"
          value={overview.reports.length}
          detail={latestReport?.title ?? 'No report recorded'}
        />
      </div>
    </section>
  )
}

function SignalCard({
  label,
  value,
  detail,
  href,
}: {
  label: string
  value: ReactNode
  detail?: string
  href?: string | null
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </>
  )
  return href ? (
    <a className="signalCard" href={href}>
      {content}
    </a>
  ) : (
    <div className="signalCard">{content}</div>
  )
}

function SkillsPanel({ overview }: { overview: TrainerOverview }) {
  const skills = overview.skills.slice(0, 6)
  return (
    <section className="learningPanel">
      <PanelTitle icon={<BarChart3 size={17} />} title="Skills" />
      {skills.length ? (
        <div className="skillStack">
          {skills.map((skill) => (
            <div className="skillRow" key={skill.id}>
              <div>
                <strong>{skill.label}</strong>
                <span>
                  {skill.level} · {skill.accepted}/{skill.attempts} accepted
                </span>
              </div>
              <div className="masteryBar" aria-label={`${skill.label} mastery`}>
                <span style={{ width: `${skill.mastery}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mutedText">Skill graph starts after the first analyzed submission.</p>
      )}
    </section>
  )
}

function RecentLearningPanel({ overview }: { overview: TrainerOverview }) {
  const submissions = overview.recentSubmissions.slice(0, 6)
  return (
    <section className="learningPanel">
      <PanelTitle icon={<History size={17} />} title="Recent outcomes" />
      {submissions.length ? (
        <div className="learningList">
          {submissions.map((submission) => (
            <Link
              className="learningListItem"
              key={submission.id}
              params={{ challengeId: submission.challengeId, submissionId: submission.id }}
              to="/problems/$challengeId/submissions/$submissionId"
            >
              <strong>{submission.challengeTitle}</strong>
              <span>
                {submission.outcome ? outcomeLabel(submission.outcome) : 'Pending'} ·{' '}
                {submission.score !== undefined ? `${submission.score}/100 · ` : ''}
                {formatDate(submission.createdAt)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mutedText">No submission history recorded.</p>
      )}
    </section>
  )
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <header className="panelTitle">
      {icon}
      <h2>{title}</h2>
    </header>
  )
}

function ImportPage() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const routeSearch = useSearch({ strict: false }) as {
    provider?: ProblemSourceProvider
    q?: string
  }
  const [provider, setProvider] = useState<ProblemSourceProvider>(
    routeSearch.provider === 'codeforces' ? 'codeforces' : 'leetcode',
  )
  const [query, setQuery] = useState(routeSearch.q ?? '')
  const [page, setPage] = useState(0)
  const selectedProvider =
    problemSourceOptions.find((option) => option.value === provider) ?? defaultProblemSourceOption
  const normalizedQuery = query.trim()
  const offset = page * problemSourcePageSize
  useEffect(() => {
    const nextProvider = routeSearch.provider === 'codeforces' ? 'codeforces' : 'leetcode'
    setProvider(nextProvider)
    setQuery(routeSearch.q ?? '')
    setPage(0)
  }, [routeSearch.provider, routeSearch.q])
  const sourcesQuery = useQuery({
    queryKey: ['problem-sources', provider, normalizedQuery, page],
    queryFn: () =>
      searchProblemSources({
        provider,
        query: normalizedQuery || undefined,
        limit: problemSourcePageSize,
        offset,
      }),
    placeholderData: (previousData) => previousData,
  })
  const importSource = useMutation({
    mutationFn: (source: ProblemSource) =>
      importProblemSource({ provider: source.provider, sourceId: source.id }),
    onSuccess: async ({ challenge }) => {
      await client.invalidateQueries({ queryKey: ['challenges'] })
      void navigate({ to: '/problems/$challengeId', params: { challengeId: challenge.id } })
    },
  })
  const sources = sourcesQuery.data?.sources ?? []
  const pageInfo = sourcesQuery.data?.pageInfo
  const currentRangeStart = sources.length ? offset + 1 : 0
  const currentRangeEnd = offset + sources.length
  const importingSourceKey =
    importSource.isPending && importSource.variables ? sourceKey(importSource.variables) : ''

  return (
    <main className="libraryPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">Problem sources</p>
          <h1>Import practice problems</h1>
        </div>
        <div className="librarySearch">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder={`Search ${selectedProvider.label}`}
          />
        </div>
      </section>
      <div className="sourceProviderBar" aria-label="Problem source">
        {problemSourceOptions.map((option) => (
          <button
            className={clsx('sourceProviderButton', provider === option.value && 'active')}
            key={option.value}
            type="button"
            onClick={() => {
              setProvider(option.value)
              setPage(0)
            }}
          >
            <strong>{option.label}</strong>
            <span>{option.hint}</span>
          </button>
        ))}
      </div>
      <div className="sourceNote">
        <Download size={16} />
        <span>
          LeetCode uses alfa-leetcode-api for public statements and examples. Codeforces uses the
          official problemset API for discovery, then imports statements and samples from the
          Codeforces mirror when available.
        </span>
      </div>
      <div className="sourcePagingSummary">
        <span>
          {sources.length
            ? `${currentRangeStart}-${currentRangeEnd} of ${pageInfo?.total ?? currentRangeEnd}`
            : 'No results loaded'}
        </span>
        {sourcesQuery.isFetching ? (
          <span className="inlineLoading">
            <Loader2 className="spinIcon" size={14} />
            Loading page
          </span>
        ) : null}
      </div>
      {sourcesQuery.isLoading && !sources.length ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Searching sources" />
      ) : sources.length ? (
        <section className="problemList sourceList" aria-label="Problem sources">
          {sources.map((source) => {
            const rowIsImporting = importingSourceKey === sourceKey(source)
            return (
              <div className="sourceRow" key={sourceKey(source)}>
                <span className="problemMeta">
                  <strong>{source.title}</strong>
                  <span>
                    {[providerLabel(source.provider), source.description || source.id].join(' · ')}
                  </span>
                </span>
                <span className={clsx('difficultyBadge', source.difficulty ?? 'unrated')}>
                  {source.difficulty ? difficultyLabel(source.difficulty) : 'Unrated'}
                </span>
                {source.url ? (
                  <a className="sourceLink" href={source.url} rel="noreferrer" target="_blank">
                    <ExternalLink size={15} />
                  </a>
                ) : null}
                <button
                  className="ghostLightButton"
                  disabled={rowIsImporting}
                  type="button"
                  onClick={() => importSource.mutate(source)}
                >
                  {rowIsImporting ? <Loader2 className="spinIcon" size={15} /> : <Plus size={15} />}
                  {rowIsImporting ? 'Importing' : 'Import'}
                </button>
              </div>
            )
          })}
        </section>
      ) : (
        <EmptyState icon={<BookOpen size={24} />} title="No importable sources found" />
      )}
      <div className="paginationBar">
        <button
          className="ghostLightButton"
          disabled={page === 0 || sourcesQuery.isFetching}
          type="button"
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="ghostLightButton"
          disabled={!pageInfo?.hasMore || sourcesQuery.isFetching}
          type="button"
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
      {importSource.error ? <div className="errorText">{importSource.error.message}</div> : null}
    </main>
  )
}

function ProblemWorkspace({
  challengeId,
  submissionId,
  view,
}: {
  challengeId: string
  submissionId?: string
  view: WorkspaceView
}) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const challengeQuery = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: () => getChallenge(challengeId),
  })
  const allChallengesQuery = useQuery({
    queryKey: ['challenges', 'workspace-switcher'],
    queryFn: () => listChallenges({}),
  })
  const submissionQuery = useQuery({
    enabled: !!submissionId,
    queryKey: ['submission', submissionId],
    queryFn: () => getSubmission(submissionId as string),
    refetchInterval: submissionId ? 3000 : false,
  })
  const challenge = challengeQuery.data?.challenge
  const submissions = challengeQuery.data?.submissions ?? []
  const challengeOptions = allChallengesQuery.data?.challenges ?? []
  const [language, setLanguage] = useState<TrainerLanguage>('javascript')
  const starter = useMemo(
    () => (challenge ? starterForLanguage(challenge, language) : ''),
    [challenge, language],
  )
  const [code, setCode] = usePersistentDraft(challengeId, language, starter)
  const [consoleView, setConsoleView] = useState<ConsoleView>('testcase')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [reviewFocus, setReviewFocus] = useState<SubmissionReviewFocus>(readStoredReviewFocus)
  const [coachingFocuses, setCoachingFocuses] =
    useState<SubmissionCoachingFocus[]>(readStoredCoachingFocuses)
  const lastSubmitted = submissions.find((item) => item.language === language) ?? submissions[0]
  const latestSubmission = submissions[0]
  const selectedSubmission =
    submissionQuery.data?.submission ?? submissions.find((item) => item.id === submissionId)
  const selectedReviewDispatch = selectedSubmission
    ? readStoredReviewDispatch(selectedSubmission.id)
    : null
  const submissionReviewMode = view === 'submission' && !!selectedSubmission
  const editorLanguage = submissionReviewMode
    ? knownLanguage(selectedSubmission.language, language)
    : language
  const editorValue = submissionReviewMode ? selectedSubmission.code : code || starter
  const submittedLanguageLabel =
    languageOptions.find((item) => item.value === editorLanguage)?.label ??
    selectedSubmission?.language
  const inboxesQuery = useQuery({
    queryKey: ['buddy-inboxes'],
    queryFn: listBuddyInboxes,
    staleTime: 60_000,
  })
  const nextChallengeQuery = useQuery({
    enabled: view === 'submission',
    queryKey: ['challenges', 'submission-next'],
    queryFn: () => listChallenges({}),
  })
  const nextChallenge = useMemo(() => {
    const challenges = nextChallengeQuery.data?.challenges ?? []
    const index = challenges.findIndex((item) => item.id === challengeId)
    return challenges[(index + 1) % challenges.length] ?? null
  }, [challengeId, nextChallengeQuery.data?.challenges])
  const buddyInboxes = inboxesQuery.data?.inboxes ?? []
  const [reviewerAgentId, setReviewerAgentId] = useState(
    () => readStoredReviewerPreference()?.agentId ?? '',
  )
  const [rememberReviewer, setRememberReviewer] = useState(
    () => !!readStoredReviewerPreference()?.agentId,
  )
  const [submitNotice, setSubmitNotice] = useState<string | null>(null)
  const selectedReviewer = buddyInboxes.find((inbox) => inbox.agent.id === reviewerAgentId)
  const selectedReviewFocus =
    reviewFocusOptions.find((option) => option.value === reviewFocus) ?? defaultReviewFocusOption
  const selectedCoachingLabels = coachingFocuses
    .map((focus) => coachingFocusOptions.find((option) => option.value === focus)?.label)
    .filter((label): label is string => !!label)
  const reviewerHint = inboxesQuery.isLoading
    ? 'Loading Buddies'
    : inboxesQuery.isError
      ? 'Buddy list unavailable'
      : selectedReviewer
        ? reviewFocus === 'interview'
          ? `Buddy will coach ${selectedCoachingLabels.join(', ').toLowerCase()}`
          : `Buddy will ${selectedReviewFocus.hint}`
        : buddyInboxes.length
          ? 'Choose a Buddy for sandbox review'
          : 'No Buddy Inbox available'

  useEffect(() => {
    if (!inboxesQuery.isSuccess || !reviewerAgentId) return
    if (buddyInboxes.some((inbox) => inbox.agent.id === reviewerAgentId)) return
    setReviewerAgentId('')
  }, [buddyInboxes, inboxesQuery.isSuccess, reviewerAgentId])

  useEffect(() => {
    if (!inboxesQuery.isSuccess || reviewerAgentId) return
    const firstBuddy = buddyInboxes[0]
    if (!firstBuddy) return
    setReviewerAgentId(firstBuddy.agent.id)
  }, [buddyInboxes, inboxesQuery.isSuccess, reviewerAgentId])

  useEffect(() => {
    if (!rememberReviewer || !reviewerAgentId) {
      clearStoredReviewerPreference()
      return
    }
    if (!selectedReviewer) return
    writeStoredReviewerPreference({
      agentId: selectedReviewer.agent.id,
      label: buddyInboxLabel(selectedReviewer),
    })
  }, [rememberReviewer, reviewerAgentId, selectedReviewer])

  useEffect(() => {
    writeStoredReviewFocus(reviewFocus)
  }, [reviewFocus])

  useEffect(() => {
    if (reviewFocus === 'interview' && !coachingFocuses.length) {
      setCoachingFocuses(defaultCoachingFocuses)
    }
  }, [coachingFocuses.length, reviewFocus])

  useEffect(() => {
    writeStoredCoachingFocuses(coachingFocuses)
  }, [coachingFocuses])

  const submit = useMutation({
    mutationFn: () =>
      createSubmission({
        challengeId,
        language,
        code: (code || starter).trim(),
        reviewer: reviewerAgentId
          ? {
              agentId: reviewerAgentId,
              assigneeLabel: selectedReviewer ? buddyInboxLabel(selectedReviewer) : undefined,
              displayName: selectedReviewer ? buddyInboxLabel(selectedReviewer) : undefined,
              reviewFocus,
              coachingFocuses: reviewFocus === 'interview' ? coachingFocuses : undefined,
              locale: currentLocale(),
            }
          : undefined,
      }),
    onSuccess: async (result) => {
      const { submission } = result
      if (reviewerAgentId) {
        const label = selectedReviewer ? buddyInboxLabel(selectedReviewer) : 'selected Buddy'
        const reviewDispatch = reviewDispatchFromResult(result, label)
        writeStoredReviewDispatch(submission.id, reviewDispatch)
        setSubmitNotice(reviewDispatchNoticeText(reviewDispatch))
      } else {
        setSubmitNotice(null)
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['challenge', challengeId] }),
        client.invalidateQueries({ queryKey: ['submissions'] }),
      ])
      void navigate({
        to: '/problems/$challengeId/submissions/$submissionId/waiting',
        params: { challengeId, submissionId: submission.id },
      })
    },
  })
  const canSubmit = !!reviewerAgentId && !submit.isPending && !!(code || starter).trim()
  const switchChallenge = (nextChallengeId: string) => {
    if (!nextChallengeId || nextChallengeId === challengeId) return
    void navigate({ to: '/problems/$challengeId', params: { challengeId: nextChallengeId } })
  }
  const restoreSubmission = (submissionIdToRestore: string) => {
    const submission = submissions.find((item) => item.id === submissionIdToRestore)
    if (!submission) return
    const restoreLanguage = knownLanguage(submission.language, language)
    setLanguage(restoreLanguage)
    setCode(submission.code)
    void navigate({ to: '/problems/$challengeId', params: { challengeId } })
  }
  const toggleCoachingFocus = (focus: SubmissionCoachingFocus) => {
    setCoachingFocuses((current) => {
      if (current.includes(focus)) {
        return current.length > 1 ? current.filter((item) => item !== focus) : current
      }
      return [...current, focus]
    })
  }
  const retryFromSubmission = () => {
    if (!selectedSubmission) return
    const retryLanguage = knownLanguage(selectedSubmission.language, language)
    window.localStorage.setItem(
      draftStorageKey(challengeId, retryLanguage),
      selectedSubmission.code,
    )
    setLanguage(retryLanguage)
    setCode(selectedSubmission.code)
    void navigate({ to: '/problems/$challengeId', params: { challengeId } })
  }

  if (challengeQuery.isLoading) {
    return (
      <main className="workspacePage">
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading workspace" />
      </main>
    )
  }

  if (!challenge) {
    return (
      <main className="workspacePage">
        <EmptyState icon={<BookOpen size={24} />} title="Problem not found" />
      </main>
    )
  }

  return (
    <main className="workspacePage">
      <div className="workspaceSwitchBar">
        <label className="problemSwitcher">
          <span>Problem</span>
          <select
            aria-label="Switch problem"
            value={challenge.id}
            onChange={(event) => switchChallenge(event.target.value)}
          >
            {(challengeOptions.length ? challengeOptions : [challenge]).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="problemSwitcherMeta">
          <span className={clsx('difficultyBadge', challenge.difficulty)}>
            {difficultyLabel(challenge.difficulty)}
          </span>
          {visibleChallengeTags(challenge)
            .slice(0, 4)
            .map((item) => (
              <span key={item}>{item}</span>
            ))}
        </div>
      </div>

      <section className="problemPane">
        <ProblemTabs challengeId={challenge.id} count={submissions.length} view={view} />
        <div className="leftScrollArea">
          {view === 'description' ? (
            <ProblemStatement challenge={challenge} />
          ) : view === 'submissions' ? (
            <ProblemSubmissions challengeId={challenge.id} submissions={submissions} />
          ) : view === 'waiting' ? (
            <WaitingSubmission
              challengeId={challenge.id}
              isLoading={submissionQuery.isLoading}
              reviewDispatch={selectedReviewDispatch}
              submission={selectedSubmission}
            />
          ) : (
            <SubmissionDetail
              challengeId={challenge.id}
              isLoading={submissionQuery.isLoading}
              submission={selectedSubmission}
            />
          )}
        </div>
      </section>

      <section className="codingPane">
        <div className="editorToolbar">
          <div className="toolbarGroup">
            <TerminalSquare size={17} />
            {submissionReviewMode ? (
              <span className="toolbarLabel">
                Submitted code <small>{submittedLanguageLabel}</small>
              </span>
            ) : (
              <select
                aria-label="Language"
                value={language}
                onChange={(event) => setLanguage(event.target.value as TrainerLanguage)}
              >
                {languageOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!submissionReviewMode ? (
            <div className="toolbarActions">
              <button className="ghostButton" type="button" onClick={() => setCode(starter)}>
                <RotateCcw size={16} />
                Reset
              </button>
              <button
                className="ghostButton"
                disabled={!lastSubmitted}
                type="button"
                onClick={() => lastSubmitted && setCode(lastSubmitted.code)}
              >
                <History size={16} />
                Last submit
              </button>
              <label className="restoreSelect">
                <History size={15} />
                <select
                  aria-label="Restore submitted version"
                  disabled={!submissions.length}
                  value=""
                  onChange={(event) => restoreSubmission(event.target.value)}
                >
                  <option value="">Restore version</option>
                  {submissions.map((submission) => (
                    <option key={submission.id} value={submission.id}>
                      {formatDate(submission.createdAt)} · {submission.language}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>
        <div className="editorFrame">
          <MonacoEditor
            height="100%"
            language={monacoLanguage(editorLanguage)}
            onChange={(value?: string) => {
              if (!submissionReviewMode) setCode(value ?? '')
            }}
            options={{
              automaticLayout: true,
              domReadOnly: submissionReviewMode,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 14,
              lineHeight: 22,
              minimap: { enabled: false },
              padding: { top: 14, bottom: 18 },
              readOnly: submissionReviewMode,
              renderLineHighlight: 'all',
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: 'off',
            }}
            theme="vs-dark"
            value={editorValue}
          />
        </div>
        <EditorConsole
          challenge={challenge}
          challengeId={challenge.id}
          latestSubmission={submissionReviewMode ? selectedSubmission : latestSubmission}
          open={consoleOpen}
          view={consoleView}
          onOpenChange={setConsoleOpen}
          onViewChange={setConsoleView}
        />
        {submissionReviewMode ? (
          <SubmissionReplayBar
            challengeId={challenge.id}
            nextChallenge={nextChallenge}
            submission={selectedSubmission}
            onRetry={retryFromSubmission}
          />
        ) : (
          <>
            {submit.error ? <div className="errorText">{submit.error.message}</div> : null}
            {submitNotice ? <div className="noticeText">{submitNotice}</div> : null}
            <div className="submitBar">
              <div className="reviewerArea">
                <div className="reviewerSelect">
                  <Bot size={15} />
                  <select
                    aria-label="Buddy reviewer"
                    disabled={inboxesQuery.isLoading || !buddyInboxes.length}
                    value={reviewerAgentId}
                    onChange={(event) => {
                      setReviewerAgentId(event.target.value)
                      setSubmitNotice(null)
                    }}
                  >
                    <option value="">
                      {inboxesQuery.isLoading ? 'Loading Buddies' : 'Choose Buddy'}
                    </option>
                    {buddyInboxes.map((inbox) => (
                      <option key={inbox.agent.id} value={inbox.agent.id}>
                        {buddyInboxLabel(inbox)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="focusPanel">
                  <div className="reviewModeGroup" aria-label="Buddy review focus">
                    {reviewFocusOptions.map((option) => (
                      <button
                        className={clsx(
                          'reviewModeButton',
                          reviewFocus === option.value && 'active',
                        )}
                        key={option.value}
                        title={option.hint}
                        type="button"
                        onClick={() => setReviewFocus(option.value)}
                      >
                        {option.value === 'interview' ? <Lightbulb size={14} /> : null}
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {reviewFocus === 'interview' ? (
                    <div className="coachingChecklist" aria-label="Interview coaching concerns">
                      {coachingFocusOptions.map((option) => (
                        <label key={option.value} title={option.hint}>
                          <input
                            checked={coachingFocuses.includes(option.value)}
                            type="checkbox"
                            onChange={() => toggleCoachingFocus(option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
                <label className="rememberToggle">
                  <input
                    checked={rememberReviewer}
                    disabled={!reviewerAgentId}
                    type="checkbox"
                    onChange={(event) => setRememberReviewer(event.target.checked)}
                  />
                  <span>Remember</span>
                </label>
                <span className="reviewerHint">{reviewerHint}</span>
              </div>
              <div className="submitActions">
                <button
                  className="primaryAction"
                  disabled={!canSubmit}
                  type="button"
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending ? (
                    <Loader2 className="spinIcon" size={17} />
                  ) : (
                    <Send size={17} />
                  )}
                  {reviewerAgentId ? 'Submit' : 'Choose Buddy'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function EditorConsole({
  challenge,
  challengeId,
  latestSubmission,
  open,
  view,
  onOpenChange,
  onViewChange,
}: {
  challenge: Challenge
  challengeId: string
  latestSubmission?: CodeSubmission
  open: boolean
  view: ConsoleView
  onOpenChange: (open: boolean) => void
  onViewChange: (view: ConsoleView) => void
}) {
  const setView = (nextView: ConsoleView) => {
    onViewChange(nextView)
    onOpenChange(true)
  }

  return (
    <div className={clsx('consolePane', open && 'open')}>
      <div className="consoleHeader">
        <div className="consoleTabs">
          <button
            className={clsx('consoleTab', view === 'testcase' && 'active')}
            type="button"
            onClick={() => setView('testcase')}
          >
            <FileText size={15} />
            Testcase
          </button>
          <button
            className={clsx('consoleTab', view === 'result' && 'active')}
            type="button"
            onClick={() => setView('result')}
          >
            {latestSubmission?.status === 'analyzed' ? (
              <CheckCircle2 size={15} />
            ) : (
              <Clock3 size={15} />
            )}
            Test Result
          </button>
        </div>
        <button
          aria-label={open ? 'Collapse console' : 'Expand console'}
          className="consoleToggle"
          type="button"
          onClick={() => onOpenChange(!open)}
        >
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {open ? (
        <div className="consoleBody">
          {view === 'testcase' ? (
            <div className="sampleStack compactCases">
              {challenge.examples.length ? (
                challenge.examples.map((example, index) => (
                  <div className="sampleCase" key={`${example.input}-${index}`}>
                    <span>Case {index + 1}</span>
                    <code>{example.input}</code>
                    <code>{example.output}</code>
                  </div>
                ))
              ) : (
                <p className="mutedText">No visible examples imported for this problem.</p>
              )}
            </div>
          ) : (
            <div className="consoleResult">
              <LatestResult submission={latestSubmission} />
              {latestSubmission ? (
                <Link
                  className="ghostLink"
                  params={{ challengeId, submissionId: latestSubmission.id }}
                  to="/problems/$challengeId/submissions/$submissionId"
                >
                  <History size={15} />
                  Open review
                </Link>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProblemTabs({
  challengeId,
  count,
  view,
}: {
  challengeId: string
  count: number
  view: WorkspaceView
}) {
  const tabbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tabbarRef.current
      ?.querySelector('.tabButton.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [view])

  return (
    <div className="tabbar" ref={tabbarRef} role="tablist">
      <Link
        activeOptions={{ exact: true }}
        className={clsx('tabButton', view === 'description' && 'active')}
        params={{ challengeId }}
        to="/problems/$challengeId"
      >
        <FileText size={16} />
        Description
      </Link>
      <Link
        className={clsx('tabButton', view !== 'description' && 'active')}
        params={{ challengeId }}
        to="/problems/$challengeId/submissions"
      >
        <History size={16} />
        Submissions
        <span className="tabCount">{count}</span>
      </Link>
    </div>
  )
}

function ProblemStatement({ challenge }: { challenge: Challenge }) {
  return (
    <article className="statement">
      <header className="statementHeader">
        <div>
          <h1>{challenge.title}</h1>
          <div className="problemFactRow">
            <span className={clsx('difficultyBadge', challenge.difficulty)}>
              {difficultyLabel(challenge.difficulty)}
            </span>
            {challenge.source ? <span>{sourceLabel(challenge)}</span> : null}
          </div>
        </div>
        {challenge.source?.url ? (
          <a
            className="statementSourceLink"
            href={challenge.source.url}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={15} />
            Source
          </a>
        ) : null}
      </header>
      <div className="tagRow">
        {visibleChallengeTags(challenge).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <MarkdownView className="promptMarkdown" content={challenge.prompt} />
      {challenge.examples.length ? (
        <>
          <h2>Examples</h2>
          <div className="examplesList">
            {challenge.examples.map((example, index) => (
              <section className="exampleBlock" key={`${example.input}-${index}`}>
                <strong>Example {index + 1}</strong>
                <dl>
                  <div>
                    <dt>Input</dt>
                    <dd>{example.input}</dd>
                  </div>
                  <div>
                    <dt>Output</dt>
                    <dd>{example.output}</dd>
                  </div>
                  {example.explanation ? (
                    <div>
                      <dt>Explanation</dt>
                      <dd>{example.explanation}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ))}
          </div>
        </>
      ) : (
        <section className="exampleEmpty">
          <h2>No visible examples imported</h2>
          <p>
            Import could not read sample tests from the source. Buddy can still review the attempt,
            but ask it to generate edge cases from the statement before scoring.
          </p>
        </section>
      )}
    </article>
  )
}

function ProblemSubmissions({
  challengeId,
  submissions,
}: {
  challengeId: string
  submissions: CodeSubmission[]
}) {
  if (!submissions.length) {
    return <EmptyState icon={<History size={24} />} title="No submissions yet" />
  }

  return (
    <div className="submissionTable">
      <div className="submissionTableHeader">
        <span>Status</span>
        <span>Submitted</span>
        <span>Review</span>
      </div>
      <div className="submissionList compactSubmissionList">
        {submissions.map((submission) => (
          <SubmissionRow challengeId={challengeId} key={submission.id} submission={submission} />
        ))}
      </div>
    </div>
  )
}

function SubmissionRow({
  challengeId,
  challengeTitle,
  submission,
}: {
  challengeId: string
  challengeTitle?: string
  submission: CodeSubmission
}) {
  return (
    <Link
      className="submissionRow"
      params={{ challengeId, submissionId: submission.id }}
      to="/problems/$challengeId/submissions/$submissionId"
    >
      <span className="submissionStatusCell">
        <span className={clsx('statusDot', submission.analysis?.outcome ?? submission.status)} />
        <strong>{statusTitle(submission)}</strong>
      </span>
      <span className="submissionMeta">
        <strong>{challengeTitle ?? submission.id}</strong>
        <span>
          {submission.language} · {formatDate(submission.createdAt)}
          {submission.reviewRequest
            ? ` · Buddy: ${reviewRequestLabel(submission.reviewRequest)}`
            : ''}
        </span>
      </span>
      <span className={clsx('outcomeBadge', submission.analysis?.outcome ?? 'pending')}>
        {submission.analysis ? outcomeLabel(submission.analysis.outcome) : 'Pending'}
      </span>
    </Link>
  )
}

function WaitingSubmission({
  challengeId,
  isLoading,
  reviewDispatch,
  submission,
}: {
  challengeId: string
  isLoading: boolean
  reviewDispatch?: ReviewDispatchNotice | null
  submission?: CodeSubmission
}) {
  const challengesQuery = useQuery({
    queryKey: ['challenges', 'waiting-next'],
    queryFn: () => listChallenges({}),
  })
  const nextChallenge = useMemo(() => {
    const challenges = challengesQuery.data?.challenges ?? []
    const index = challenges.findIndex((challenge) => challenge.id === challengeId)
    return challenges[(index + 1) % challenges.length] ?? null
  }, [challengeId, challengesQuery.data?.challenges])

  if (isLoading) {
    return <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading review status" />
  }

  if (!submission) {
    return <EmptyState icon={<History size={24} />} title="Submission not found" />
  }

  return (
    <article className="submissionDetail waitingDetail">
      <div className="waitingHero">
        {submission.analysis ? (
          <CheckCircle2 size={24} />
        ) : (
          <Loader2 className="spinIcon" size={24} />
        )}
        <div>
          <p className="eyebrow">{submission.language}</p>
          <h2>{submission.analysis ? 'Review ready' : 'Waiting for Buddy review'}</h2>
        </div>
      </div>
      <ReviewFlow reviewDispatch={reviewDispatch} submission={submission} />
      <section className="analysisBlock">
        {submission.analysis ? (
          <>
            <MarkdownView className="analysisSummary" content={submission.analysis.summary} />
            <MarkdownView content={submission.analysis.explanation} />
          </>
        ) : (
          <p>
            {submission.reviewRequest
              ? `${reviewRequestLabel(
                  submission.reviewRequest,
                )} has the submission in Inbox. This page refreshes automatically while Buddy runs sandbox cases.`
              : 'Review assignment is missing.'}
          </p>
        )}
      </section>
      <div className="waitingActions">
        <Link
          className="primaryLink"
          params={{ challengeId, submissionId: submission.id }}
          to="/problems/$challengeId/submissions/$submissionId"
        >
          <FileText size={16} />
          Open feedback
        </Link>
        {nextChallenge && nextChallenge.id !== challengeId ? (
          <Link
            className="ghostLink"
            params={{ challengeId: nextChallenge.id }}
            to="/problems/$challengeId"
          >
            <ArrowRight size={16} />
            Next problem
          </Link>
        ) : null}
      </div>
    </article>
  )
}

function ReviewFlow({
  reviewDispatch,
  submission,
}: {
  reviewDispatch?: ReviewDispatchNotice | null
  submission: CodeSubmission
}) {
  const assignedLabel = submission.reviewRequest
    ? reviewRequestLabel(submission.reviewRequest)
    : 'Buddy'
  const fallbackDispatch: ReviewDispatchNotice = {
    reviewerLabel: assignedLabel,
    status: submission.reviewRequest ? 'unconfirmed' : 'error',
    error: submission.reviewRequest ? undefined : 'Review assignment is missing.',
  }
  const assignment = reviewDispatch ?? fallbackDispatch
  const hasAnalysis = !!submission.analysis
  const assignmentState: ReviewFlowStepState =
    assignment.status === 'error'
      ? 'error'
      : assignment.status === 'delivered'
        ? 'complete'
        : assignment.status === 'pending_approval'
          ? 'waiting'
          : 'active'
  const sandboxState: ReviewFlowStepState = hasAnalysis
    ? 'complete'
    : assignmentState === 'error'
      ? 'waiting'
      : 'active'
  const steps: Array<{
    title: string
    detail: string
    state: ReviewFlowStepState
  }> = [
    {
      title: 'Submission saved',
      detail: `${submission.language} code is stored in Code Trainer.`,
      state: 'complete',
    },
    {
      title: reviewDispatchStepTitle(assignment),
      detail: reviewDispatchStepDetail(assignment),
      state: assignmentState,
    },
    {
      title: 'Buddy sandbox review',
      detail: hasAnalysis
        ? 'Buddy finished the test run and diagnosis.'
        : 'Buddy should claim, acknowledge, run cases, then write the result back.',
      state: sandboxState,
    },
    {
      title: 'Feedback written back',
      detail: hasAnalysis
        ? 'The analysis is ready in this workspace.'
        : 'This page refreshes automatically as soon as submissions.analyze completes.',
      state: hasAnalysis ? 'complete' : 'waiting',
    },
  ]

  return (
    <section className="reviewFlow" aria-label="Review progress">
      <div className="reviewFlowHeader">
        <strong>Live review</strong>
        <span>{hasAnalysis ? 'Feedback ready' : reviewDispatchNoticeText(assignment)}</span>
      </div>
      <ol className="reviewFlowList">
        {steps.map((step) => (
          <li className={clsx('reviewFlowStep', step.state)} key={step.title}>
            <span className="reviewFlowMarker">
              {step.state === 'complete' ? (
                <CheckCircle2 size={15} />
              ) : step.state === 'error' ? (
                <AlertCircle size={15} />
              ) : step.state === 'active' ? (
                <Loader2 className="spinIcon" size={15} />
              ) : (
                <Clock3 size={15} />
              )}
            </span>
            <span>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function SubmissionDetail({
  challengeId,
  isLoading,
  submission,
}: {
  challengeId: string
  isLoading: boolean
  submission?: CodeSubmission
}) {
  if (isLoading) {
    return <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading submission" />
  }

  if (!submission) {
    return <EmptyState icon={<History size={24} />} title="Submission not found" />
  }

  const assignedLabel = submission.reviewRequest
    ? reviewRequestLabel(submission.reviewRequest)
    : null

  return (
    <article className="submissionDetail reviewDetail">
      <div className="reviewTopline">
        <Link className="backLink" params={{ challengeId }} to="/problems/$challengeId/submissions">
          Back to submissions
        </Link>
        <span>{formatDate(submission.createdAt)}</span>
      </div>

      <header className="reviewResultHeader">
        <div className="reviewVerdict">
          <span className={clsx('outcomeBadge', submission.analysis?.outcome ?? 'pending')}>
            {submission.analysis ? outcomeLabel(submission.analysis.outcome) : 'Pending'}
          </span>
          <h2>{statusTitle(submission)}</h2>
          <p>
            {submission.language}
            {assignedLabel ? ` · Reviewed by ${assignedLabel}` : ''}
            {submission.reviewRequest?.reviewFocus
              ? ` · ${reviewFocusLabel(submission.reviewRequest.reviewFocus)}`
              : ''}
          </p>
        </div>
        <div className="reviewScoreBlock">
          <strong>{submission.analysis ? `${submission.analysis.score}/100` : '--'}</strong>
          <span>Score</span>
        </div>
      </header>

      {submission.analysis ? (
        <>
          <section className="reviewSection reviewSummarySection">
            <h3>Summary</h3>
            <MarkdownView content={submission.analysis.summary} />
          </section>

          <section className="reviewSection">
            <h3>Analysis</h3>
            <MarkdownView content={submission.analysis.explanation} />
          </section>

          <div className="reviewSectionGrid">
            {submission.analysis.complexity ? (
              <section className="reviewSection">
                <h3>Complexity</h3>
                <MarkdownView content={submission.analysis.complexity} />
              </section>
            ) : null}
            {submission.analysis.suggestions.length ? (
              <section className="reviewSection">
                <h3>Next Steps</h3>
                <ol className="suggestionList">
                  {submission.analysis.suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <MarkdownView content={suggestion} />
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </>
      ) : (
        <section className="analysisBlock pendingBlock">
          <Clock3 size={20} />
          <p>
            {submission.reviewRequest
              ? `Waiting for ${reviewRequestLabel(
                  submission.reviewRequest,
                )} to run sandbox cases and explain the result.`
              : 'Analysis pending.'}
          </p>
        </section>
      )}
    </article>
  )
}

function SubmissionReplayBar({
  challengeId,
  nextChallenge,
  submission,
  onRetry,
}: {
  challengeId: string
  nextChallenge?: Challenge | null
  submission: CodeSubmission
  onRetry: () => void
}) {
  return (
    <div className="submissionReplayBar">
      <div className="submissionReplayText">
        <strong>Review this attempt before retry.</strong>
        <span>
          Buddy feedback stays on the left; the submitted code is read-only here so the next attempt
          starts from an explicit retry.
        </span>
      </div>
      <div className="submissionReplayActions">
        <button className="ghostLightButton" type="button" onClick={onRetry}>
          <RotateCcw size={16} />
          Retry from this code
        </button>
        <Link
          className="ghostLink"
          params={{ challengeId }}
          to="/problems/$challengeId/submissions"
        >
          <History size={16} />
          All submissions
        </Link>
        {nextChallenge && nextChallenge.id !== challengeId ? (
          <Link
            className="primaryLink"
            params={{ challengeId: nextChallenge.id }}
            to="/problems/$challengeId"
          >
            <ArrowRight size={16} />
            Next problem
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function LatestResult({ submission }: { submission?: CodeSubmission }) {
  if (!submission) {
    return <p className="mutedText">No submissions yet.</p>
  }

  if (!submission.analysis) {
    return (
      <div className="resultBox">
        <span className="outcomeBadge pending">Pending</span>
        <p>
          {formatDate(submission.createdAt)}
          {submission.reviewRequest ? ` · ${reviewRequestLabel(submission.reviewRequest)}` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="resultBox">
      <span className={clsx('outcomeBadge', submission.analysis.outcome)}>
        {outcomeLabel(submission.analysis.outcome)}
      </span>
      <strong>{submission.analysis.score}/100</strong>
      <MarkdownView className="compactMarkdown" content={submission.analysis.summary} />
    </div>
  )
}

function SubmissionsPage() {
  const submissionsQuery = useQuery({
    queryKey: ['submissions'],
    queryFn: () => listSubmissions({ limit: 100 }),
  })
  const challengesQuery = useQuery({
    queryKey: ['challenges', 'all'],
    queryFn: () => listChallenges({}),
  })
  const challengeById = useMemo(() => {
    return new Map(
      (challengesQuery.data?.challenges ?? []).map((challenge) => [challenge.id, challenge]),
    )
  }, [challengesQuery.data?.challenges])
  const submissions = submissionsQuery.data?.submissions ?? []

  return (
    <main className="submissionsPage">
      <section className="libraryHeader">
        <div>
          <p className="eyebrow">History</p>
          <h1>Submissions</h1>
        </div>
      </section>
      {submissionsQuery.isLoading ? (
        <EmptyState icon={<Loader2 className="spinIcon" />} title="Loading submissions" />
      ) : submissions.length ? (
        <div className="submissionList globalList">
          {submissions.map((submission) => {
            const challenge = challengeById.get(submission.challengeId)
            return (
              <SubmissionRow
                challengeId={submission.challengeId}
                challengeTitle={challenge?.title ?? submission.challengeId}
                key={submission.id}
                submission={submission}
              />
            )
          })}
        </div>
      ) : (
        <EmptyState icon={<History size={24} />} title="No submissions yet" />
      )}
    </main>
  )
}

function MarkdownView({ className, content }: { className?: string; content: string }) {
  return (
    <div className={clsx('markdownView', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="emptyState">
      {icon}
      <strong>{title}</strong>
    </div>
  )
}

function buddyInboxLabel(inbox: BuddyInboxOption) {
  return (
    inbox.agent.user?.displayName?.trim() || inbox.agent.user?.username?.trim() || inbox.agent.id
  )
}

function reviewRequestLabel(reviewRequest: NonNullable<CodeSubmission['reviewRequest']>) {
  return (
    reviewRequest.displayName?.trim() ||
    reviewRequest.assigneeLabel?.trim() ||
    reviewRequest.agentId?.trim() ||
    'Buddy'
  )
}

function reviewFocusLabel(value: SubmissionReviewFocus) {
  return reviewFocusOptions.find((option) => option.value === value)?.label ?? 'Sandbox review'
}

function reviewDispatchFromResult(payload: unknown, reviewerLabel: string): ReviewDispatchNotice {
  const delivery = ShadowBridge.inboxDeliveries(payload)[0]
  const error = ShadowBridge.inboxErrors(payload)[0]
  if (delivery) return reviewDispatchFromDelivery(delivery, reviewerLabel)
  if (error) return reviewDispatchFromError(error, reviewerLabel)
  return {
    reviewerLabel,
    status: 'unconfirmed',
  }
}

function reviewDispatchFromDelivery(
  delivery: InboxDelivery,
  reviewerLabel: string,
): ReviewDispatchNotice {
  return {
    reviewerLabel,
    status: delivery.pendingId ? 'pending_approval' : 'delivered',
    channelId: delivery.channelId,
    messageId: delivery.messageId,
    taskId: delivery.taskId,
    pendingId: delivery.pendingId,
  }
}

function reviewDispatchFromError(
  error: InboxDeliveryError,
  reviewerLabel: string,
): ReviewDispatchNotice {
  return {
    reviewerLabel,
    status: 'error',
    error: error.error,
  }
}

function reviewDispatchNoticeText(notice: ReviewDispatchNotice) {
  if (notice.status === 'delivered') {
    return `Task sent to ${notice.reviewerLabel} Inbox. Buddy can claim it now.`
  }
  if (notice.status === 'pending_approval') {
    return `Submitted. ${notice.reviewerLabel} assignment is waiting for Inbox approval.`
  }
  if (notice.status === 'error') {
    return `Submitted, but ${notice.reviewerLabel} assignment needs attention: ${notice.error ?? 'delivery failed'}.`
  }
  return `Submitted. Waiting for Shadow to confirm ${notice.reviewerLabel} Inbox delivery.`
}

function reviewDispatchStepTitle(notice: ReviewDispatchNotice) {
  if (notice.status === 'delivered') return 'Inbox task delivered'
  if (notice.status === 'pending_approval') return 'Inbox approval pending'
  if (notice.status === 'error') return 'Inbox delivery needs attention'
  return 'Confirming Inbox delivery'
}

function reviewDispatchStepDetail(notice: ReviewDispatchNotice) {
  if (notice.status === 'delivered') {
    return `${notice.reviewerLabel} has the review card and can respond immediately.`
  }
  if (notice.status === 'pending_approval') {
    return 'Shadow created the assignment request and is waiting for approval before Buddy receives it.'
  }
  if (notice.status === 'error') {
    return notice.error ?? 'Shadow could not deliver the review card to Buddy Inbox.'
  }
  return 'Shadow is still reporting the task delivery receipt.'
}

function reviewDispatchStorageKey(submissionId: string) {
  return `${reviewDispatchStoragePrefix}${submissionId}`
}

function isReviewDispatchStatus(value: unknown): value is ReviewDispatchStatus {
  return (
    value === 'delivered' ||
    value === 'pending_approval' ||
    value === 'error' ||
    value === 'unconfirmed'
  )
}

function optionalStoredString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStoredReviewDispatch(submissionId: string): ReviewDispatchNotice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(reviewDispatchStorageKey(submissionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!isReviewDispatchStatus(parsed.status)) return null
    const reviewerLabel = optionalStoredString(parsed.reviewerLabel)
    if (!reviewerLabel) return null
    return {
      reviewerLabel,
      status: parsed.status,
      channelId: optionalStoredString(parsed.channelId),
      messageId: optionalStoredString(parsed.messageId),
      taskId: optionalStoredString(parsed.taskId) ?? null,
      pendingId: optionalStoredString(parsed.pendingId) ?? null,
      error: optionalStoredString(parsed.error),
    }
  } catch {
    return null
  }
}

function writeStoredReviewDispatch(submissionId: string, notice: ReviewDispatchNotice) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(reviewDispatchStorageKey(submissionId), JSON.stringify(notice))
  } catch {
    /* session persistence is best-effort */
  }
}

function readStoredReviewFocus(): SubmissionReviewFocus {
  if (typeof window === 'undefined') return 'standard'
  try {
    const value = window.localStorage.getItem(reviewFocusStorageKey)
    return value === 'interview' || value === 'debug' || value === 'complexity' ? value : 'standard'
  } catch {
    return 'standard'
  }
}

function writeStoredReviewFocus(value: SubmissionReviewFocus) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(reviewFocusStorageKey, value)
  } catch {
    /* local preference persistence is best-effort */
  }
}

function readStoredCoachingFocuses(): SubmissionCoachingFocus[] {
  if (typeof window === 'undefined') return defaultCoachingFocuses
  try {
    const raw = window.localStorage.getItem(coachingFocusStorageKey)
    if (!raw) return defaultCoachingFocuses
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return defaultCoachingFocuses
    const allowed = new Set(coachingFocusOptions.map((option) => option.value))
    const values = parsed.filter((item): item is SubmissionCoachingFocus => allowed.has(item))
    return values.length ? values : defaultCoachingFocuses
  } catch {
    return defaultCoachingFocuses
  }
}

function writeStoredCoachingFocuses(value: SubmissionCoachingFocus[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(coachingFocusStorageKey, JSON.stringify(value))
  } catch {
    /* local preference persistence is best-effort */
  }
}

function currentLocale() {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language || navigator.languages?.[0] || 'en'
}

function readStoredReviewerPreference() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(reviewerStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { agentId?: unknown; label?: unknown }
    return typeof parsed.agentId === 'string' && parsed.agentId.trim()
      ? {
          agentId: parsed.agentId.trim(),
          label: typeof parsed.label === 'string' ? parsed.label : '',
        }
      : null
  } catch {
    return null
  }
}

function writeStoredReviewerPreference(input: { agentId: string; label: string }) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(reviewerStorageKey, JSON.stringify(input))
  } catch {
    /* local preference persistence is best-effort */
  }
}

function clearStoredReviewerPreference() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(reviewerStorageKey)
  } catch {
    /* local preference persistence is best-effort */
  }
}

function useTrainerRuntimeInvalidation() {
  const client = useQueryClient()
  useEffect(() => {
    return subscribeTrainerEvents((event) => {
      if (
        event.command !== 'submissions.analyze' &&
        event.command !== 'submissions.create' &&
        event.command !== 'challenges.upsert' &&
        event.command !== 'sources.import' &&
        event.command !== 'learning.plan.upsert' &&
        event.command !== 'skills.update' &&
        event.command !== 'recommendations.create' &&
        event.command !== 'tips.create' &&
        event.command !== 'checks.create' &&
        event.command !== 'reports.create' &&
        event.command !== 'wrongProblems.schedule'
      ) {
        return
      }
      void client.invalidateQueries({ queryKey: ['challenge'] })
      void client.invalidateQueries({ queryKey: ['submission'] })
      void client.invalidateQueries({ queryKey: ['submissions'] })
      void client.invalidateQueries({ queryKey: ['challenges'] })
      void client.invalidateQueries({ queryKey: ['learning-overview'] })
    })
  }, [client])
}

function normalizeHostNavigationPath(value: unknown) {
  if (typeof value !== 'string') return null
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//')) return null
  return path.slice(0, 240)
}

function useTrainerHostNavigation() {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data =
        event.data && typeof event.data === 'object' && !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : null
      if (data?.type !== hostNavigationRequestType) return
      const path = normalizeHostNavigationPath(data.path)
      if (!path) return
      window.location.hash = path
      if (typeof data.requestId === 'string' && event.source) {
        const sourceWindow = event.source as Window
        sourceWindow.postMessage(
          {
            type: hostNavigationAckType,
            requestId: data.requestId,
          },
          event.origin || '*',
        )
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
}

function usePersistentDraft(challengeId: string, language: TrainerLanguage, starter: string) {
  const key = draftStorageKey(challengeId, language)
  const [code, setCode] = useState(starter)

  useEffect(() => {
    const saved = window.localStorage.getItem(key)
    setCode(saved ?? starter)
  }, [key, starter])

  useEffect(() => {
    window.localStorage.setItem(key, code)
  }, [code, key])

  return [code, setCode] as const
}

function draftStorageKey(challengeId: string, language: TrainerLanguage) {
  return `trainer:draft:${challengeId}:${language}`
}

function knownLanguage(value: string | undefined, fallback: TrainerLanguage): TrainerLanguage {
  return languageOptions.find((item) => item.value === value)?.value ?? fallback
}

function starterForLanguage(challenge: Challenge, language: TrainerLanguage) {
  if (language === 'python') {
    return `# ${challenge.title}\n\ndef solve():\n    pass\n`
  }
  return challenge.starterCode
}

function monacoLanguage(language: TrainerLanguage) {
  return languageOptions.find((item) => item.value === language)?.monaco ?? 'javascript'
}

function difficultyLabel(value: Challenge['difficulty'] | 'all') {
  if (value === 'easy') return 'Easy'
  if (value === 'medium') return 'Medium'
  if (value === 'hard') return 'Hard'
  return 'All'
}

function sourceLabel(challenge: Challenge) {
  if (challenge.source?.provider === 'exercism') return 'Imported'
  if (challenge.source?.provider === 'leetcode') return 'LeetCode'
  if (challenge.source?.provider === 'codeforces') return 'Codeforces'
  if (challenge.source?.provider === 'manual') return 'Manual'
  return 'Trainer'
}

function visibleChallengeTags(challenge: Challenge) {
  return challenge.tags.filter((tag) => tag.toLowerCase() !== 'exercism')
}

function providerLabel(provider: ProblemSourceProvider) {
  if (provider === 'leetcode') return 'LeetCode'
  return 'Codeforces'
}

function recommendationStrategyLabel(
  value: NonNullable<TrainerOverview['recommendations'][number]['strategy']>,
) {
  if (value === 'reinforce') return 'Reinforce'
  if (value === 'diversify') return 'Diversify'
  if (value === 'review') return 'Review'
  return 'Popular'
}

function sourceKey(source: ProblemSource) {
  return `${source.provider}:${source.id}`
}

function caseCountLabel(challenge: Challenge) {
  const count = challenge.testCases?.length ? challenge.testCases.length : challenge.examples.length
  return `${count} ${count === 1 ? 'case' : 'cases'}`
}

function statusTitle(submission: CodeSubmission) {
  if (!submission.analysis) return 'Analysis pending'
  return outcomeLabel(submission.analysis.outcome)
}

function outcomeLabel(value: NonNullable<CodeSubmission['analysis']>['outcome']) {
  if (value === 'accepted') return 'Accepted'
  if (value === 'needs_work') return 'Needs work'
  if (value === 'runtime_error') return 'Runtime error'
  return 'Incomplete'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const rootElement = document.getElementById('root') as HTMLElement
const trainerWindow = window as Window & { __shadowTrainerRoot?: Root }
trainerWindow.__shadowTrainerRoot ??= createRoot(rootElement)
trainerWindow.__shadowTrainerRoot.render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
)
